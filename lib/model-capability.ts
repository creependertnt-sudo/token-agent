import { prisma } from "@/lib/db";

export type ModelCapabilityRow = {
  serviceType: string;
  name: string;
  tokenCost: number;
  positioning: string;
  suitableFor: string;
  notSuitableFor: string;
  persona: string;
  keywords: string;
};

export async function listModelCapabilities(): Promise<ModelCapabilityRow[]> {
  const rows = await prisma.modelCapability.findMany({
    orderBy: { sortOrder: "asc" },
  });
  return rows.map((r) => ({
    serviceType: r.serviceType,
    name: r.name,
    tokenCost: r.tokenCost,
    positioning: r.positioning,
    suitableFor: r.suitableFor,
    notSuitableFor: r.notSuitableFor,
    persona: r.persona,
    keywords: r.keywords,
  }));
}

export async function getModelCapability(
  serviceType: string,
): Promise<ModelCapabilityRow | null> {
  const r = await prisma.modelCapability.findUnique({ where: { serviceType } });
  if (!r) return null;
  return {
    serviceType: r.serviceType,
    name: r.name,
    tokenCost: r.tokenCost,
    positioning: r.positioning,
    suitableFor: r.suitableFor,
    notSuitableFor: r.notSuitableFor,
    persona: r.persona,
    keywords: r.keywords,
  };
}

/** 注入 SALES / 比较用的模型能力（全部来自 ModelCapability 表） */
export function formatModelCapabilitiesForPrompt(
  rows: ModelCapabilityRow[],
  highlight?: string | null,
): string {
  if (rows.length === 0) {
    return "（ModelCapability 表暂无数据。）";
  }

  return rows
    .map((r) => {
      const mark =
        highlight && r.serviceType === highlight ? " ← 本轮倾向推荐" : "";
      return `### ${r.serviceType} · ${r.name} · ${r.tokenCost} Token/次${mark}
定位：${r.positioning}
适合：${r.suitableFor}
不太适合：${r.notSuitableFor}
画像：${r.persona}`;
    })
    .join("\n\n");
}

export function formatSingleModelCapabilityForPrompt(
  row: ModelCapabilityRow,
): string {
  return `【ModelCapability 数据库】
名称：${row.name}（${row.serviceType}）
Token：${row.tokenCost}/次
定位：${row.positioning}
适用场景：${row.suitableFor}
限制：${row.notSuitableFor}
典型画像：${row.persona}`;
}
