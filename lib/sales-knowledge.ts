import { prisma } from "@/lib/db";
import { scopeTenantId } from "@/lib/tenant-context";

export type SalesKnowledgeHit = {
  id: string;
  category: string;
  title: string;
  content: string;
  keywords: string;
  score: number;
};

export const SALES_KNOWLEDGE_CATEGORIES = [
  "product",
  "pricing",
  "model_diff",
  "competitor",
  "faq",
  "script",
] as const;

export type SalesKnowledgeCategory =
  (typeof SALES_KNOWLEDGE_CATEGORIES)[number];

const CATEGORY_LABEL: Record<string, string> = {
  product: "产品介绍",
  pricing: "套餐价格",
  model_diff: "A/B/C模型区别",
  competitor: "竞品分析",
  faq: "FAQ",
  script: "销售话术",
};

/** 分词：中文按连续字块 + 英文/数字词 */
export function tokenizeQuery(query: string): string[] {
  const raw = query.trim().toLowerCase();
  if (!raw) return [];

  const tokens = new Set<string>();
  for (const m of raw.match(/[a-z0-9_]+|[\u4e00-\u9fff]{1,8}/g) ?? []) {
    if (m.length >= 1) tokens.add(m);
  }

  // 常见销售意图补全 token
  if (/套餐|价格|多少钱|充值|购买/.test(raw)) {
    tokens.add("套餐");
    tokens.add("价格");
    tokens.add("token");
  }
  if (/模型|light|standard|premium|适合|推荐/.test(raw)) {
    tokens.add("模型");
    tokens.add("light");
    tokens.add("standard");
    tokens.add("premium");
  }
  if (/区别|对比|竞品|其他|别的|coze|dify|fastgpt|chatbase|扣子/.test(raw)) {
    tokens.add("竞品");
    tokens.add("对比");
    tokens.add("coze");
    tokens.add("dify");
    tokens.add("fastgpt");
    tokens.add("chatbase");
  }
  if (/是什么|介绍|平台|token\s*ai/.test(raw)) {
    tokens.add("介绍");
    tokens.add("产品");
  }

  return [...tokens];
}

function scoreDocument(
  doc: { category: string; title: string; content: string; keywords: string },
  tokens: string[],
): number {
  if (tokens.length === 0) return 0;

  const title = doc.title.toLowerCase();
  const content = doc.content.toLowerCase();
  const keywords = doc.keywords.toLowerCase();
  const category = doc.category.toLowerCase();

  let score = 0;
  for (const t of tokens) {
    if (!t) continue;
    if (keywords.includes(t)) score += 6;
    if (title.includes(t)) score += 5;
    if (category.includes(t)) score += 2;
    if (content.includes(t)) score += 2;
  }

  // 类别意图加权
  const joined = tokens.join(" ");
  if (/套餐|价格|充值|购买/.test(joined) && doc.category === "pricing") {
    score += 8;
  }
  if (/模型|light|standard|premium|适合/.test(joined) && doc.category === "model_diff") {
    score += 8;
  }
  if (/竞品|对比|区别|其他/.test(joined) && doc.category === "competitor") {
    score += 8;
  }
  if (/介绍|是什么|平台/.test(joined) && doc.category === "product") {
    score += 6;
  }
  if (/怎么|如何|faq|常见/.test(joined) && doc.category === "faq") {
    score += 6;
  }

  return score;
}

/**
 * 销售知识库检索（SQLite 关键词打分 RAG，无向量依赖）。
 * preferredCategories：来自销售意图，用于加权召回。
 */
export async function searchSalesKnowledge(input: {
  query: string;
  limit?: number;
  category?: string;
  preferredCategories?: string[];
  tenantId?: string | null;
}): Promise<SalesKnowledgeHit[]> {
  const limit = Math.min(Math.max(input.limit ?? 5, 1), 20);
  const tokens = tokenizeQuery(input.query);
  const preferred = new Set(
    (input.preferredCategories ?? []).map((c) => c.toLowerCase()),
  );
  const tenantId = scopeTenantId(input.tenantId);

  const rows = await prisma.salesKnowledge.findMany({
    where: {
      tenantId,
      ...(input.category ? { category: input.category } : {}),
    },
    orderBy: { updatedAt: "desc" },
    take: 200,
  });

  if (rows.length === 0) return [];

  if (tokens.length === 0) {
    const preferredRows = preferred.size
      ? rows.filter((r) => preferred.has(r.category.toLowerCase()))
      : [];
    const pool = preferredRows.length > 0 ? preferredRows : rows;
    return pool.slice(0, limit).map((r) => ({
      id: r.id,
      category: r.category,
      title: r.title,
      content: r.content,
      keywords: r.keywords,
      score: preferred.has(r.category.toLowerCase()) ? 2 : 1,
    }));
  }

  const scored = rows
    .map((row) => {
      let score = scoreDocument(row, tokens);
      if (preferred.has(row.category.toLowerCase())) score += 10;
      return {
        id: row.id,
        category: row.category,
        title: row.title,
        content: row.content,
        keywords: row.keywords,
        score,
      };
    })
    .filter((h) => h.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length > 0) return scored.slice(0, limit);

  const fallback = rows.filter(
    (r) =>
      preferred.has(r.category.toLowerCase()) ||
      r.category === "product" ||
      r.category === "model_diff",
  );
  return fallback.slice(0, limit).map((r) => ({
    id: r.id,
    category: r.category,
    title: r.title,
    content: r.content,
    keywords: r.keywords,
    score: 0.5,
  }));
}

/** 注入 system prompt 的知识块 */
export function formatSalesKnowledgeForPrompt(
  hits: SalesKnowledgeHit[],
): string {
  if (hits.length === 0) {
    return "（本次未检索到匹配知识条目，请先问诊需求，勿编造套餐价格。）";
  }

  return hits
    .map((h, i) => {
      const label = CATEGORY_LABEL[h.category] ?? h.category;
      return `### [${i + 1}] ${label} · ${h.title}
${h.content.trim()}`;
    })
    .join("\n\n");
}
