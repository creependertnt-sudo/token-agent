import type { CustomerLevel } from "@/lib/customer-level";
import type { UsageEstimate } from "@/lib/usage-estimator";

export type PushStrategy = "STRONG" | "MEDIUM" | "SOFT" | "NONE";

export type RecommendedPackageSnapshot = {
  id: string;
  name: string;
  tokenAmount: number;
  price: number;
};

export type SalesEngineInput = {
  customerLevel: CustomerLevel;
  usageEstimate: UsageEstimate | null;
  upsell: boolean;
  recommendedPackage: RecommendedPackageSnapshot | null;
};

export type FinalSalesDecision = {
  package: SalesEngineInput["recommendedPackage"];
  finalPackage: SalesEngineInput["recommendedPackage"];
  upsell: boolean;
  pushStrategy: PushStrategy;
  strategy: string;
  reasons: string[];
};

const STRATEGY_COPY: Record<PushStrategy, string> = {
  STRONG: "直接推荐升级，推动成交",
  MEDIUM: "介绍套餐，询问需求",
  SOFT: "教育用户，不要强推",
  NONE: "先问诊，不强推",
};

/**
 * 统一销售决策引擎：套餐推荐与升级判断之后的最终裁判。
 */
export function finalizeSalesDecision(
  input: SalesEngineInput,
): FinalSalesDecision {
  const { customerLevel, usageEstimate, upsell, recommendedPackage } = input;
  const reasons: string[] = [];

  const heavy =
    usageEstimate?.usageLevel === "HEAVY" ||
    usageEstimate?.intensity === "heavy" ||
    (usageEstimate?.estimatedTokens ?? 0) >= 80_000;

  let pushStrategy: PushStrategy = "SOFT";

  if (customerLevel === "VIP") {
    pushStrategy = "STRONG";
    reasons.push("客户分层 VIP → 强推成交");
  } else if (customerLevel === "HIGH_VALUE") {
    pushStrategy = "STRONG";
    reasons.push("客户分层 HIGH_VALUE → 强推成交");
  } else if (upsell) {
    pushStrategy = "STRONG";
    reasons.push("触发升级 → 强推成交");
  } else if (heavy) {
    pushStrategy = "STRONG";
    reasons.push("高用量预测 → 强推成交");
  } else if (customerLevel === "POTENTIAL") {
    pushStrategy = "MEDIUM";
    reasons.push("客户分层 POTENTIAL → 介绍套餐并询问需求");
  } else {
    pushStrategy = "SOFT";
    reasons.push("普通咨询 → 教育用户，不强推");
  }

  if (!recommendedPackage) {
    pushStrategy = "NONE";
    reasons.push("无可用套餐，先问诊");
  } else {
    reasons.push(`最终套餐：${recommendedPackage.name}`);
  }

  if (upsell) reasons.push("upsell=true");

  return {
    package: recommendedPackage,
    finalPackage: recommendedPackage,
    upsell,
    pushStrategy,
    strategy: STRATEGY_COPY[pushStrategy],
    reasons,
  };
}

export function formatFinalSalesDecisionForPrompt(
  decision: FinalSalesDecision,
): string {
  const pkg = decision.finalPackage;
  const pkgLine = pkg
    ? `${pkg.name}（${pkg.tokenAmount.toLocaleString()} Token，¥${pkg.price}）`
    : "暂无";
  const reasonLines = decision.reasons
    .map((r, i) => `${i + 1}. ${r}`)
    .join("\n");

  return `【销售决策】
推荐套餐：${pkgLine}
是否升级：${decision.upsell ? "是" : "否"}
推进策略：${decision.pushStrategy}
策略说明：${decision.strategy}
- STRONG：直接推荐最终套餐并引导购买，禁止罗列全部套餐
- MEDIUM：解释后推荐最终套餐
- SOFT：先教育用户；仅在用户问价时提及最终套餐
- NONE：只问诊
依据：
${reasonLines}`;
}
