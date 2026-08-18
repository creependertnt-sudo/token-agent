import { prisma } from "@/lib/db";

export type ModelConfigRow = {
  serviceType: string;
  grade: string;
  name: string;
  capability: string;
  suitableFor: string;
  limitations: string;
  tokenCost: number;
  maxContext: number;
  systemInstructions: string;
  enableReasoning: boolean;
  memoryRounds: number;
  keywords: string;
};

const GRADE_TO_TYPE: Record<string, string> = {
  A: "LIGHT",
  B: "STANDARD",
  C: "PREMIUM",
  LIGHT: "LIGHT",
  STANDARD: "STANDARD",
  PREMIUM: "PREMIUM",
  a: "LIGHT",
  b: "STANDARD",
  c: "PREMIUM",
};

function mapRow(r: {
  serviceType: string;
  grade: string;
  name: string;
  capability: string;
  suitableFor: string;
  limitations: string;
  tokenCost: number;
  maxContext: number;
  systemInstructions: string;
  enableReasoning: boolean;
  memoryRounds: number;
  keywords: string;
}): ModelConfigRow {
  return {
    serviceType: r.serviceType,
    grade: r.grade,
    name: r.name,
    capability: r.capability,
    suitableFor: r.suitableFor,
    limitations: r.limitations,
    tokenCost: r.tokenCost,
    maxContext: r.maxContext,
    systemInstructions: r.systemInstructions,
    enableReasoning: r.enableReasoning,
    memoryRounds: r.memoryRounds,
    keywords: r.keywords,
  };
}

export async function listModelConfigs(): Promise<ModelConfigRow[]> {
  const rows = await prisma.modelConfig.findMany({
    orderBy: { sortOrder: "asc" },
  });
  return rows.map(mapRow);
}

export async function getModelConfig(
  serviceType: string,
): Promise<ModelConfigRow | null> {
  const r = await prisma.modelConfig.findUnique({ where: { serviceType } });
  return r ? mapRow(r) : null;
}

/**
 * SALES 默认 false；付费档读 ModelConfig.enableReasoning。
 * 表无记录时：PREMIUM true，其余 false。
 */
export async function resolveEnableReasoning(
  serviceType: string,
): Promise<boolean> {
  if (serviceType === "SALES") return false;
  const cfg = await getModelConfig(serviceType);
  if (cfg) return Boolean(cfg.enableReasoning);
  return serviceType === "PREMIUM";
}

/**
 * 短期记忆轮数：读 ModelConfig.memoryRounds；SALES / 缺省为 16。
 * LIGHT 默认偏短、PREMIUM 偏长（由 seed 写入，可改库）。
 */
export async function resolveMemoryRounds(
  serviceType: string,
): Promise<number> {
  if (serviceType === "SALES") return 16;
  const cfg = await getModelConfig(serviceType);
  if (cfg && cfg.memoryRounds > 0) return cfg.memoryRounds;
  if (serviceType === "LIGHT") return 6;
  if (serviceType === "STANDARD") return 12;
  if (serviceType === "PREMIUM") return 16;
  return 16;
}

/** 从用户话中解析要比较的等级，如「A和C」「LIGHT 和 PREMIUM」 */
export function parseComparedGrades(message: string): string[] {
  const found: string[] = [];
  const push = (g: string) => {
    if (!found.includes(g)) found.push(g);
  };

  if (
    /A模型|Ａ模型|LIGHT|轻量档|A档/i.test(message) ||
    /(^|[^A-Za-z])A([^A-Za-z]|$)/.test(message)
  ) {
    push("A");
  }
  if (
    /B模型|Ｂ模型|STANDARD|均衡档|B档/i.test(message) ||
    /(^|[^A-Za-z])B([^A-Za-z]|$)/.test(message)
  ) {
    push("B");
  }
  if (
    /C模型|Ｃ模型|PREMIUM|高级档|C档/i.test(message) ||
    /(^|[^A-Za-z])C([^A-Za-z]|$)/.test(message)
  ) {
    push("C");
  }

  if (found.length >= 2) return found;
  if (/区别|对比|差在|哪个强|有什么不同/.test(message) && found.length === 1) {
    return ["A", "B", "C"];
  }
  if (
    /区别|对比|差在|有什么不同|哪个模型/.test(message) &&
    found.length === 0
  ) {
    return ["A", "B", "C"];
  }
  return found;
}

export function isModelCompareQuestion(message: string): boolean {
  const t = message.trim();
  if (!/(区别|对比|差在|不同|哪个强|vs|VS|和.*比)/.test(t)) return false;
  return (
    /[ABCＡＢＣ]|A模型|B模型|C模型|LIGHT|STANDARD|PREMIUM|轻量|高级|均衡/i.test(
      t,
    ) || /模型/.test(t)
  );
}

/**
 * 模型比较说明：只根据数据库 ModelConfig 生成，禁止业务层写死差异正文。
 */
export function formatModelComparisonFromDb(
  configs: ModelConfigRow[],
  grades?: string[],
): string {
  if (configs.length === 0) {
    return "（ModelConfig 表无数据，无法比较。请先 seed。）";
  }

  let selected = configs;
  if (grades && grades.length > 0) {
    const want = new Set(
      grades.map((g) => GRADE_TO_TYPE[g] ?? GRADE_TO_TYPE[g.toUpperCase()] ?? g),
    );
    const filtered = configs.filter((c) => want.has(c.serviceType));
    if (filtered.length > 0) selected = filtered;
  }

  const lines = selected.map(
    (c) => `### ${c.grade}档 · ${c.name}（${c.serviceType}）
- Token 价格：${c.tokenCost} / 次
- 最大上下文：约 ${c.maxContext.toLocaleString()} tokens
- 能力：${c.capability}
- 适用场景：${c.suitableFor}
- 限制：${c.limitations}`,
  );

  return `【模型比较 · 来源 ModelConfig 表】
以下内容来自数据库，请据此回答用户「A/B/C 区别」，不要编造未列出的能力。

${lines.join("\n\n")}`;
}

export function formatModelConfigsForPrompt(
  rows: ModelConfigRow[],
  highlight?: string | null,
): string {
  if (rows.length === 0) {
    return "（ModelConfig 表暂无数据。）";
  }

  return rows
    .map((r) => {
      const mark =
        highlight && r.serviceType === highlight ? " ← 本轮倾向推荐" : "";
      return `### ${r.grade} · ${r.name}（${r.serviceType}）${mark}
价格：${r.tokenCost} Token/次｜上下文：${r.maxContext.toLocaleString()}
能力：${r.capability}
适用：${r.suitableFor}
限制：${r.limitations}`;
    })
    .join("\n\n");
}

export function formatSingleModelConfigForPrompt(
  config: ModelConfigRow,
): string {
  return `【本通道 ModelConfig（数据库）】
等级：${config.grade}
名称：${config.name}
serviceType：${config.serviceType}
Token 价格：${config.tokenCost} / 次
最大上下文：${config.maxContext.toLocaleString()}
能力描述：${config.capability}
适用场景：${config.suitableFor}
限制：${config.limitations}
行为说明：${config.systemInstructions || "（无 systemInstructions，仅按能力与限制作答）"}
思考模式 enableReasoning：${config.enableReasoning ? "开" : "关"}
短期记忆轮数 memoryRounds：${config.memoryRounds}`;
}
