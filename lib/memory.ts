import { MemoryCategory } from "@/app/generated/prisma/enums";
import { prisma } from "@/lib/db";
import { resolveTenantIdByUserId } from "@/lib/tenant-context";
import type OpenAI from "openai";

export type MemoryItem = {
  id: string;
  category: MemoryCategory;
  content: string;
  updatedAt?: Date;
};

const CATEGORY_WEIGHT: Record<MemoryCategory, number> = {
  business: 4,
  preference: 3,
  product: 2,
  fact: 1,
};

const CATEGORY_LABEL: Record<MemoryCategory, string> = {
  preference: "用户偏好",
  business: "用户业务信息",
  product: "商品信息",
  fact: "历史重要事实",
};

const LOW_VALUE_RE =
  /^(你好|您好|哈喽|谢谢|感谢|嗯+|好的|ok|okay|是的|不是|再见).{0,8}$/i;

export async function getUserMemories(userId: string): Promise<MemoryItem[]> {
  const tenantId = await resolveTenantIdByUserId(userId);
  return prisma.agentMemory.findMany({
    where: { userId, tenantId },
    orderBy: [{ category: "asc" }, { updatedAt: "desc" }],
    select: {
      id: true,
      category: true,
      content: true,
      updatedAt: true,
    },
  });
}

/** Prompt 只注入重要 Memory，不把全部历史塞进上下文。 */
export function selectImportantMemories(
  memories: MemoryItem[],
  limit: number,
): MemoryItem[] {
  if (memories.length <= limit) return memories;
  const ranked = [...memories].sort((a, b) => {
    const w = CATEGORY_WEIGHT[b.category] - CATEGORY_WEIGHT[a.category];
    if (w !== 0) return w;
    const ta = a.updatedAt?.getTime() ?? 0;
    const tb = b.updatedAt?.getTime() ?? 0;
    if (tb !== ta) return tb - ta;
    return b.content.length - a.content.length;
  });
  return ranked.slice(0, limit);
}

function normalizeMemoryText(content: string): string {
  return content.replace(/\s+/g, " ").trim().toLowerCase();
}

function isLowValueMemory(content: string): boolean {
  const t = content.trim();
  if (t.length < 6) return true;
  return LOW_VALUE_RE.test(t);
}

/**
 * 超过配额时：删低价值 → 合并重复 → 同类摘要，直到 <= max。
 * 不调用 LLM，不扣 Token。
 */
export async function enforceMemoryQuota(
  userId: string,
  maxMemories: number,
): Promise<number> {
  const cap = Math.max(1, Math.floor(maxMemories));
  let rows = await prisma.agentMemory.findMany({
    where: { userId },
    orderBy: { updatedAt: "asc" },
  });
  if (rows.length <= cap) return rows.length;

  const lowIds = rows.filter((r) => isLowValueMemory(r.content)).map((r) => r.id);
  if (lowIds.length > 0) {
    await prisma.agentMemory.deleteMany({
      where: { userId, id: { in: lowIds } },
    });
    rows = rows.filter((r) => !lowIds.includes(r.id));
  }
  if (rows.length <= cap) return rows.length;

  const keep = new Map<string, (typeof rows)[number]>();
  const dupIds: string[] = [];
  for (const row of [...rows].reverse()) {
    const key = `${row.category}:${normalizeMemoryText(row.content)}`;
    const existing = keep.get(key);
    if (existing) {
      if (row.content.length > existing.content.length) {
        dupIds.push(existing.id);
        keep.set(key, row);
      } else {
        dupIds.push(row.id);
      }
      continue;
    }
    const contained = [...keep.values()].find(
      (o) =>
        o.category === row.category &&
        (o.content.includes(row.content) || row.content.includes(o.content)),
    );
    if (contained) {
      if (row.content.length > contained.content.length) {
        dupIds.push(contained.id);
        keep.delete(`${contained.category}:${normalizeMemoryText(contained.content)}`);
        keep.set(key, row);
      } else {
        dupIds.push(row.id);
      }
      continue;
    }
    keep.set(key, row);
  }
  if (dupIds.length > 0) {
    await prisma.agentMemory.deleteMany({
      where: { userId, id: { in: dupIds } },
    });
    const drop = new Set(dupIds);
    rows = rows.filter((r) => !drop.has(r.id));
  }
  if (rows.length <= cap) return rows.length;

  const overflow = rows.length - cap;
  const oldest = rows.slice(0, overflow + 4);
  const byCat = new Map<MemoryCategory, typeof oldest>();
  for (const row of oldest) {
    const list = byCat.get(row.category) ?? [];
    list.push(row);
    byCat.set(row.category, list);
  }

  for (const list of byCat.values()) {
    if (rows.length <= cap) break;
    if (list.length < 2) continue;
    const summary = list
      .map((r) => r.content.trim())
      .join("；")
      .slice(0, 400);
    const keepOne = list[list.length - 1]!;
    const removeIds = list.slice(0, -1).map((r) => r.id);
    await prisma.agentMemory.update({
      where: { id: keepOne.id },
      data: { content: `摘要：${summary}` },
    });
    await prisma.agentMemory.deleteMany({
      where: { userId, id: { in: removeIds } },
    });
    const drop = new Set(removeIds);
    rows = rows
      .filter((r) => !drop.has(r.id))
      .map((r) =>
        r.id === keepOne.id ? { ...r, content: `摘要：${summary}` } : r,
      );
  }

  if (rows.length > cap) {
    const extra = rows.slice(0, rows.length - cap).map((r) => r.id);
    await prisma.agentMemory.deleteMany({
      where: { userId, id: { in: extra } },
    });
    rows = rows.slice(rows.length - cap);
  }

  return rows.length;
}

export type CatalogPromptData = {
  packagesText: string;
  modelsText: string;
};

type PromptOptions = {
  intent?: string;
  showProducts?: boolean;
  catalog: CatalogPromptData;
};

export function buildSystemPrompt(
  memories: MemoryItem[],
  tokenBalance = 0,
  options: PromptOptions,
): string {
  const showProducts = options.showProducts === true;
  const intent = options.intent ?? "free";
  const { packagesText, modelsText } = options.catalog;

  const salesRule = showProducts
    ? `本次用户有购买/充值相关意图，请根据下方「数据库套餐」准确给出名称、Token 数量、价格，并引导前往 /recharge 购买。`
    : `本次为普通咨询：不要主动刷整页套餐。仅当用户明确询问价格/套餐时才引用「数据库套餐」。`;

  const modelRule =
    intent === "model"
      ? `用户正在询问 AI 模型/厂商：必须仅依据「数据库模型」作答，不要编造未列出的型号或价格。`
      : `若用户问到模型能力、厂商对比，仅依据「数据库模型」回答；没有的数据请明确说暂未收录。`;

  const base = `你是 Token Sales AI 销售客服。回答必须基于实时从数据库注入的资料，禁止使用训练记忆中的固定套餐/模型清单覆盖数据库内容。

核心定位：
1. 普通售前咨询、套餐与价格查询、模型咨询、购买引导均为免费。
2. 用户购买的 Token 是「AI服务额度」：业务分析消耗 10 Token，写作消耗 50 Token。
3. ${salesRule}
4. ${modelRule}

【数据库套餐 TokenPackage】（询问价格/套餐时必须引用这里的数字）
${packagesText}

【数据库模型 AIModel + AIProvider】（询问模型时必须引用这里的内容）
${modelsText}

回复规范：
1. 优先使用下方「长期记忆」；若与数据库冲突，以数据库为准。
2. ${showProducts ? "用清晰列表展示套餐并引导购买。" : "勿每次回复都刷套餐。"}
3. 当前用户余额 ${tokenBalance} Token；额度为 0 时仍可回答售前问题。
4. 语气专业、简洁；具体数字与型号一律来自数据库区块，不要臆造。`;

  if (memories.length === 0) {
    return `${base}

【长期记忆】
暂无已保存记忆。`;
  }

  const grouped = memories.reduce<Record<string, string[]>>((acc, item) => {
    const label = CATEGORY_LABEL[item.category];
    if (!acc[label]) acc[label] = [];
    acc[label].push(`- ${item.content}`);
    return acc;
  }, {});

  const memoryText = Object.entries(grouped)
    .map(([label, lines]) => `${label}：\n${lines.join("\n")}`)
    .join("\n\n");

  return `${base}

【长期记忆】
${memoryText}`;
}

type ExtractedMemory = {
  category: MemoryCategory;
  content: string;
};

function isMemoryCategory(value: string): value is MemoryCategory {
  return (
    value === "preference" ||
    value === "business" ||
    value === "product" ||
    value === "fact"
  );
}

export async function extractAndSaveMemories(params: {
  client: OpenAI;
  userId: string;
  userMessage: string;
  assistantReply: string;
  existingMemories: MemoryItem[];
}) {
  const { client, userId, userMessage, assistantReply, existingMemories } =
    params;

  try {
    const existingText =
      existingMemories.length === 0
        ? "无"
        : existingMemories
            .map((m) => `- [${m.category}] ${m.content}`)
            .join("\n");

    const completion = await client.chat.completions.create({
      model: "deepseek-chat",
      messages: [
        {
          role: "system",
          content: `从对话中提取值得长期保存的用户事实。只返回 JSON 数组，无则 []。
元素格式：{"category":"preference|business|product|fact","content":"..."}
已有记忆：
${existingText}`,
        },
        {
          role: "user",
          content: `用户：${userMessage}\n助手：${assistantReply}`,
        },
      ],
      temperature: 0,
      thinking: { type: "disabled" },
    } as Parameters<typeof client.chat.completions.create>[0]);

    const raw = completion.choices[0]?.message?.content?.trim() ?? "[]";
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

    const parsed = JSON.parse(jsonMatch[0]) as ExtractedMemory[];
    if (!Array.isArray(parsed)) return [];

    const saved: MemoryItem[] = [];
    for (const item of parsed.slice(0, 5)) {
      if (!item?.content || !isMemoryCategory(String(item.category))) continue;
      const content = String(item.content).trim().slice(0, 280);
      if (!content) continue;

      const duplicate = existingMemories.some(
        (m) => m.category === item.category && m.content === content,
      );
      if (duplicate) continue;

      const created = await prisma.agentMemory.create({
        data: {
          userId,
          tenantId: await resolveTenantIdByUserId(userId),
          category: item.category,
          content,
        },
        select: { id: true, category: true, content: true },
      });
      saved.push(created);
    }
    return saved;
  } catch {
    return [];
  }
}
