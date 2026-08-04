import { prisma } from "@/lib/db";

export type RecommendContext = {
  message: string;
  customerType: string;
  intent: string;
  budgetLevel: string | null;
  techLevel: string | null;
  industry: string | null;
  needs: string[];
};

export type ModelRecommendRuleRow = {
  name: string;
  priority: number;
  customerType: string;
  intent: string;
  budgetLevel: string;
  techLevel: string;
  matchKeywords: string;
  requireKeywords: string;
  excludeKeywords: string;
  recommendServiceType: string;
  reasonTemplate: string;
  confidence: string;
};

export type RecommendHit = {
  serviceType: "LIGHT" | "STANDARD" | "PREMIUM";
  reason: string;
  confidence: "low" | "medium" | "high";
  ruleName: string;
};

export async function listModelRecommendRules(): Promise<
  ModelRecommendRuleRow[]
> {
  const rows = await prisma.modelRecommendRule.findMany({
    where: { active: true },
    orderBy: { priority: "desc" },
  });
  return rows.map((r) => ({
    name: r.name,
    priority: r.priority,
    customerType: r.customerType,
    intent: r.intent,
    budgetLevel: r.budgetLevel,
    techLevel: r.techLevel,
    matchKeywords: r.matchKeywords,
    requireKeywords: r.requireKeywords,
    excludeKeywords: r.excludeKeywords,
    recommendServiceType: r.recommendServiceType,
    reasonTemplate: r.reasonTemplate,
    confidence: r.confidence,
  }));
}

function splitKeywords(raw: string): string[] {
  return raw
    .split(/[,，]/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function fieldMatch(rule: string, actual: string | null): boolean {
  if (rule === "*" || !rule) return true;
  if (!actual) return false;
  return rule.toLowerCase() === actual.toLowerCase();
}

function isPaidTier(
  t: string,
): t is "LIGHT" | "STANDARD" | "PREMIUM" {
  return t === "LIGHT" || t === "STANDARD" || t === "PREMIUM";
}

/**
 * 按 ModelRecommendRule 表匹配推荐档位（不写死推荐理由正文）。
 */
export function applyModelRecommendRules(
  ctx: RecommendContext,
  rules: ModelRecommendRuleRow[],
): RecommendHit | null {
  const hay = [
    ctx.message,
    ctx.industry ?? "",
    ctx.needs.join(" "),
  ]
    .join(" ")
    .toLowerCase();

  let best: { hit: RecommendHit; score: number; priority: number } | null =
    null;

  for (const rule of rules) {
    if (!fieldMatch(rule.customerType, ctx.customerType)) continue;
    if (!fieldMatch(rule.intent, ctx.intent)) continue;
    if (!fieldMatch(rule.budgetLevel, ctx.budgetLevel)) continue;
    if (!fieldMatch(rule.techLevel, ctx.techLevel)) continue;

    const exclude = splitKeywords(rule.excludeKeywords);
    if (exclude.some((k) => hay.includes(k))) continue;

    const require = splitKeywords(rule.requireKeywords);
    if (require.length > 0 && !require.every((k) => hay.includes(k))) {
      continue;
    }

    const matchKws = splitKeywords(rule.matchKeywords);
    let score = 1; // base: dimension filters matched
    if (matchKws.length > 0) {
      const hits = matchKws.filter((k) => hay.includes(k)).length;
      if (hits === 0) continue;
      score += hits * 2;
    }

    if (rule.budgetLevel !== "*") score += 2;
    if (rule.techLevel !== "*") score += 2;
    if (rule.customerType !== "*") score += 2;
    if (rule.intent !== "*") score += 1;

    if (!isPaidTier(rule.recommendServiceType)) continue;

    const conf =
      rule.confidence === "high" || rule.confidence === "low"
        ? rule.confidence
        : "medium";

    const hit: RecommendHit = {
      serviceType: rule.recommendServiceType,
      reason: rule.reasonTemplate,
      confidence: conf,
      ruleName: rule.name,
    };

    if (
      !best ||
      score > best.score ||
      (score === best.score && rule.priority > best.priority)
    ) {
      best = { hit, score, priority: rule.priority };
    }
  }

  return best?.hit ?? null;
}

export function formatRecommendRuleHitForPrompt(
  hit: RecommendHit | null,
): string {
  if (!hit) {
    return "【推荐规则 ModelRecommendRule】未命中有效规则 → 先问诊，勿强推档位。";
  }
  return `【推荐规则 ModelRecommendRule】
命中规则：${hit.ruleName}
推荐：${hit.serviceType}
理由（数据库）：${hit.reason}
置信度：${hit.confidence}`;
}
