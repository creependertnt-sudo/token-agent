import { prisma } from "@/lib/db";

export type SalesStrategyRow = {
  code: string;
  intent: string;
  customerType: string;
  name: string;
  guidelines: string;
  talkTrack: string;
  forbidden: string;
  priority: number;
};

export async function listSalesStrategies(): Promise<SalesStrategyRow[]> {
  const rows = await prisma.salesStrategy.findMany({
    where: { active: true },
    orderBy: { priority: "desc" },
  });
  return rows.map((r) => ({
    code: r.code,
    intent: r.intent,
    customerType: r.customerType,
    name: r.name,
    guidelines: r.guidelines,
    talkTrack: r.talkTrack,
    forbidden: r.forbidden,
    priority: r.priority,
  }));
}

function matchesField(ruleValue: string, actual: string): boolean {
  return ruleValue === "*" || ruleValue.toUpperCase() === actual.toUpperCase();
}

/** 按意图 + 客户类型取最优策略（可多条合并） */
export function matchSalesStrategies(
  strategies: SalesStrategyRow[],
  intent: string,
  customerType: string,
  limit = 3,
): SalesStrategyRow[] {
  return strategies
    .filter(
      (s) =>
        matchesField(s.intent, intent) &&
        matchesField(s.customerType, customerType),
    )
    .sort((a, b) => b.priority - a.priority)
    .slice(0, limit);
}

export function formatSalesStrategiesForPrompt(
  rows: SalesStrategyRow[],
): string {
  if (rows.length === 0) {
    return "（SalesStrategy 未命中；保持问诊优先，勿编造价格。）";
  }
  return rows
    .map(
      (s) => `### ${s.name}（${s.code}）
意图匹配：${s.intent}｜客户：${s.customerType}
执行准则：${s.guidelines}
话术：${s.talkTrack}
禁止：${s.forbidden || "无"}`,
    )
    .join("\n\n");
}
