import {
  extractCustomerDemandSignals,
  type CustomerDemandAnalysis,
} from "@/lib/customer-analysis";
import {
  formatCustomerProfileForPrompt,
  listCustomerProfiles,
  matchCustomerProfile,
  profileCodeToCustomerType,
} from "@/lib/customer-profile";
import {
  formatCompetitorsForPrompt,
  searchCompetitorKnowledge,
} from "@/lib/competitor-knowledge";
import { resolveTenantIdByUserId } from "@/lib/tenant-context";
import {
  listActivePackages,
} from "@/lib/catalog";
import {
  formatModelCapabilitiesForPrompt,
  listModelCapabilities,
} from "@/lib/model-capability";
import {
  formatModelComparisonFromDb,
  formatModelConfigsForPrompt,
  isModelCompareQuestion,
  listModelConfigs,
  parseComparedGrades,
  type ModelConfigRow,
} from "@/lib/model-config";
import {
  applyModelRecommendRules,
  formatRecommendRuleHitForPrompt,
  listModelRecommendRules,
  type RecommendHit,
} from "@/lib/model-recommend-rule";
import {
  buildSalesDecision,
  buildPackageUpgradeAdvice,
  formatPackageUpgradeForPrompt,
  shouldUpsellPackage,
  type PackageUpgradeAdvice,
  type SalesDecision,
} from "@/lib/sales-decision";
import {
  formatSalesStrategiesForPrompt,
  listSalesStrategies,
  matchSalesStrategies,
} from "@/lib/sales-strategy";
import {
  formatSalesKnowledgeForPrompt,
  searchSalesKnowledge,
} from "@/lib/sales-knowledge";
import {
  formatCustomerMemoryForPrompt,
  getCustomerMemory,
  type CustomerMemoryRow,
} from "@/lib/customer-memory";
import {
  recommendTokenPackage,
  type PackageRecommendResult,
} from "@/lib/package-recommend";
import {
  evaluateCustomerLevel,
  formatCustomerLevelForPrompt,
  type CustomerLevelResult,
} from "@/lib/customer-level";
import {
  finalizeSalesDecision,
  formatFinalSalesDecisionForPrompt,
  type FinalSalesDecision,
} from "@/lib/sales-decision-engine";
import {
  buildSalesConversion,
  formatCurrentRecommendedPackageForPrompt,
  formatSalesConversionForPrompt,
  type SalesConversion,
} from "@/lib/sales-conversion";
import {
  estimateUsage,
  formatUsageEstimateForPrompt,
  type UsageEstimate,
} from "@/lib/usage-estimator";
import { prisma } from "@/lib/db";
import { OrderStatus } from "@/app/generated/prisma/enums";

/** 实时 SUCCESS 订单（SALES prompt 用） */
export type RecentSuccessOrder = {
  id: string;
  packageName: string;
  tokenAmount: number;
  createdAt: Date;
};

const RECENT_ORDERS_LIMIT = 8;

async function sumConsumedTokens(userId: string): Promise<number> {
  const agg = await prisma.tokenUsage.aggregate({
    where: { userId },
    _sum: { amount: true },
  });
  return Math.abs(agg._sum.amount ?? 0);
}

async function listRecentSuccessOrders(
  userId: string,
): Promise<RecentSuccessOrder[]> {
  const rows = await prisma.order.findMany({
    where: { userId, status: OrderStatus.SUCCESS },
    orderBy: { createdAt: "desc" },
    take: RECENT_ORDERS_LIMIT,
    include: {
      package: { select: { name: true } },
    },
  });

  return rows.map((o) => ({
    id: o.id,
    packageName: o.package?.name?.trim() || "未知套餐",
    tokenAmount: o.tokenAmount,
    createdAt: o.createdAt,
  }));
}

/** 注入 SALES prompt：【最近购买记录】 */
export function formatRecentOrdersForPrompt(
  orders: RecentSuccessOrder[],
): string {
  if (orders.length === 0) {
    return "【最近购买记录】\n暂无成功支付订单（实时查询 Order 表）。";
  }

  const lines = orders.map((o) => {
    const time = o.createdAt.toISOString().slice(0, 16).replace("T", " ");
    return `- ${o.packageName} × ${o.tokenAmount.toLocaleString()} Token（${time}）`;
  });

  return `【最近购买记录】\n${lines.join("\n")}`;
}

export type SalesPipelineResult = {
  decision: SalesDecision;
  analysis: CustomerDemandAnalysis;
  modelConfigs: ModelConfigRow[];
  recommendHit: RecommendHit | null;
  customerMemory: CustomerMemoryRow | null;
  packageRecommend: PackageRecommendResult | null;
  packageUpgrade: PackageUpgradeAdvice | null;
  customerLevel: CustomerLevelResult | null;
  usageEstimate: UsageEstimate | null;
  finalDecision: FinalSalesDecision | null;
  conversion: SalesConversion;
  /** 合并注入 system prompt 的上下文 */
  promptContext: string;
  meta: {
    intent: string;
    customerType: string;
    industry: string | null;
    budget: string | null;
    techLevel: string | null;
    recommended: string | null;
    recommendedPackage: string | null;
    packageRecommendReason: string | null;
    readyToRecommend: boolean;
    knowledgeHitCount: number;
    competitorHitCount: number;
    strategyHitCount: number;
    ruleHit: string | null;
    modelCompare: boolean;
    hasCustomerMemory: boolean;
    customerLevel: string | null;
    usageIntensity: string | null;
    usageExceedsLastPackage: boolean;
    pushStrategy: string | null;
    showProductCards: boolean;
    conversionCta: string | null;
    recommendedPackageId: string | null;
    rechargePath: string | null;
  };
};

/**
 * SALES 标准流水线（数据库驱动）：
 * 用户问题 → 意图识别 → 查询数据库 → 获取模型/套餐/竞品/长期客户记忆 → 生成销售回复上下文
 */
export async function runSalesPipeline(
  message: string,
  options?: {
    userId?: string;
    tokenBalance?: number | null;
    chatIntent?: string;
  },
): Promise<SalesPipelineResult> {
  // 1) 意图识别（规则分类，决定后续查哪些库）
  const decision = buildSalesDecision(message);
  const signals = extractCustomerDemandSignals(message);
  const tenantId = await resolveTenantIdByUserId(options?.userId);

  const wantCompare =
    isModelCompareQuestion(message) ||
    (decision.intent === "MODEL_SELECT" &&
      /区别|对比|差在/.test(message));

  const wantCompetitors =
    decision.intent === "PRODUCT_COMPARE" ||
    /coze|dify|fastgpt|chatbase|扣子|竞品/.test(message.toLowerCase());

  // 2) 查询数据库（并行）
  const [
    knowledgeHits,
    modelConfigs,
    capabilities,
    competitorHits,
    strategies,
    profiles,
    recommendRules,
    packages,
    customerMemory,
    recentOrders,
    consumedTokens,
  ] = await Promise.all([
    searchSalesKnowledge({
      query: message,
      limit: 5,
      preferredCategories: decision.knowledgeCategories,
      tenantId,
    }),
    listModelConfigs(),
    listModelCapabilities(),
    wantCompetitors
      ? searchCompetitorKnowledge({ query: message, limit: 4, tenantId })
      : Promise.resolve([]),
    listSalesStrategies(),
    listCustomerProfiles(),
    listModelRecommendRules(),
    listActivePackages(),
    options?.userId
      ? getCustomerMemory(options.userId)
      : Promise.resolve(null),
    options?.userId
      ? listRecentSuccessOrders(options.userId)
      : Promise.resolve([]),
    options?.userId ? sumConsumedTokens(options.userId) : Promise.resolve(0),
  ]);

  // 3) 客户画像（DB）覆盖决策中的客户类型
  const profile = matchCustomerProfile(message, profiles);
  if (profile) {
    decision.customerType = profileCodeToCustomerType(profile.code);
    if (profile.clarifyingQuestions.length > 0 && !decision.readyToRecommend) {
      decision.clarifyingQuestions = profile.clarifyingQuestions;
    }
  }

  // 4) 推荐规则（DB）覆盖硬编码推荐
  const recommendHit = applyModelRecommendRules(
    {
      message,
      customerType: decision.customerType,
      intent: decision.intent,
      budgetLevel: signals.budget,
      techLevel: signals.techLevel,
      industry: signals.industry,
      needs: signals.needs,
    },
    recommendRules,
  );

  if (recommendHit && recommendHit.confidence !== "low") {
    decision.recommendation = {
      primary: recommendHit.serviceType,
      alternatives: (["LIGHT", "STANDARD", "PREMIUM"] as const).filter(
        (t) => t !== recommendHit.serviceType,
      ),
      reason: recommendHit.reason,
    };
    decision.readyToRecommend =
      decision.intent === "MODEL_SELECT" ||
      decision.intent === "PRICE_QUERY" ||
      decision.intent === "ENTERPRISE_PLAN" ||
      decision.intent === "PRODUCT_COMPARE" ||
      decision.intent === "TECH_REQUIREMENT" ||
      recommendHit.confidence === "high";
  } else if (
    profile?.defaultRecommend &&
    (profile.defaultRecommend === "LIGHT" ||
      profile.defaultRecommend === "STANDARD" ||
      profile.defaultRecommend === "PREMIUM") &&
    decision.recommendation.primary == null
  ) {
    decision.recommendation = {
      primary: profile.defaultRecommend,
      alternatives: [],
      reason: `客户画像 ${profile.code} 的默认倾向（CustomerProfile.defaultRecommend）`,
    };
  }

  // 刷新决策 prompt（含 DB 覆盖后的推荐）
  decision.promptBlock = rebuildDecisionPrompt(decision);

  const matchedStrategies = matchSalesStrategies(
    strategies,
    decision.intent,
    decision.customerType,
  );

  const highlight =
    decision.recommendation.primary ?? recommendHit?.serviceType ?? null;

  const compareGrades = wantCompare ? parseComparedGrades(message) : [];
  const comparisonBlock = wantCompare
    ? formatModelComparisonFromDb(
        modelConfigs,
        compareGrades.length >= 2 ? compareGrades : undefined,
      )
    : "";

  const customerLevel = evaluateCustomerLevel({
    tokenBalance: options?.tokenBalance ?? null,
    recentOrders,
    signals,
    memory: customerMemory,
    message,
    customerType: decision.customerType,
  });
  const usageEstimate = estimateUsage({
    message,
    signals,
    memory: customerMemory,
    tokenBalance: options?.tokenBalance ?? null,
    recentOrders,
    consumedTokens,
  });

  const upsellCheck = shouldUpsellPackage({
    message,
    intent: decision.intent,
    signals: decision.signals,
    demandSignals: signals,
    recentOrders,
    usageEstimate,
  });

  const packageRecommend = recommendTokenPackage({
    tokenBalance: options?.tokenBalance ?? null,
    recentOrders,
    customerMemory,
    signals,
    message,
    packages,
    upsellContext: {
      shouldUpsell: upsellCheck.shouldUpsell,
      upgradeReason: upsellCheck.upgradeReason,
      previousPackageName: upsellCheck.previousPackageName,
    },
    customerType: decision.customerType,
    enterpriseSignal: decision.signals.enterprise === true,
    usageEstimate,
    customerLevel: customerLevel.level,
  });

  const packageUpgrade =
    upsellCheck.shouldUpsell &&
    packageRecommend.recommendedPackage &&
    upsellCheck.previousPackageName &&
    upsellCheck.currentNeedLabel &&
    upsellCheck.upgradeReason
      ? buildPackageUpgradeAdvice({
          previousPackageName: upsellCheck.previousPackageName,
          currentNeedLabel: upsellCheck.currentNeedLabel,
          upgradeReason: upsellCheck.upgradeReason,
          recommendedPackage: packageRecommend.recommendedPackage,
        })
      : null;
  const packageUpgradeBlock = formatPackageUpgradeForPrompt(packageUpgrade);

  const finalDecision = finalizeSalesDecision({
    customerLevel: customerLevel.level,
    usageEstimate,
    upsell: upsellCheck.shouldUpsell,
    recommendedPackage: packageRecommend.recommendedPackage,
  });
  const finalDecisionBlock = formatFinalSalesDecisionForPrompt(finalDecision);

  const conversion = buildSalesConversion({
    finalDecision,
    salesIntent: decision.intent,
    chatIntent: options?.chatIntent,
  });
  const conversionBlock = formatSalesConversionForPrompt(conversion);

  const packageOfferBlock = formatCurrentRecommendedPackageForPrompt(
    conversion.showProducts && packageRecommend.recommendedPackage
      ? {
          name: packageRecommend.recommendedPackage.name,
          tokenAmount: packageRecommend.recommendedPackage.tokenAmount,
          price: packageRecommend.recommendedPackage.price,
          reason: packageRecommend.reason,
        }
      : null,
  );

  const recommendBlock = buildRecommendBlock(
    highlight,
    modelConfigs,
    recommendHit,
    signals,
  );

  const analysis: CustomerDemandAnalysis = {
    industry: signals.industry,
    budget: signals.budget,
    needs: signals.needs,
    techLevel: signals.techLevel,
    recommendedModel: highlight,
    recommendReason:
      recommendHit?.reason ?? decision.recommendation.reason,
    confidence: recommendHit?.confidence ?? "low",
    promptBlock: signals.promptBlock,
  };

  // 5) 合并上下文 → 供 LLM 生成销售回复（含长期 CustomerMemory + 实时订单）
  const recentOrdersBlock = formatRecentOrdersForPrompt(recentOrders);

  const promptContext = [
    `【流水线】用户问题 → 意图识别 → 查询数据库 → 模型/套餐/竞品/客户记忆 → 销售回复`,
    formatCustomerMemoryForPrompt(customerMemory),
    recentOrdersBlock,
    formatCustomerLevelForPrompt(customerLevel),
    formatUsageEstimateForPrompt(usageEstimate),
    packageOfferBlock,
    conversion.showProducts ? packageUpgradeBlock : "",
    conversion.showProducts ? finalDecisionBlock : "",
    conversionBlock,
    decision.promptBlock,
    formatCustomerProfileForPrompt(profile),
    signals.promptBlock,
    formatRecommendRuleHitForPrompt(recommendHit),
    recommendBlock,
    `【销售策略 SalesStrategy】\n${formatSalesStrategiesForPrompt(matchedStrategies)}`,
    `【模型配置 ModelConfig】\n${formatModelConfigsForPrompt(modelConfigs, highlight)}`,
    `【模型能力 ModelCapability】\n${formatModelCapabilitiesForPrompt(capabilities, highlight)}`,
    comparisonBlock,
    `【竞品知识 CompetitorKnowledge】\n${formatCompetitorsForPrompt(competitorHits)}`,
    `【销售知识 RAG SalesKnowledge】\n${formatSalesKnowledgeForPrompt(knowledgeHits)}`,
    `【硬规则】老用户优先参考 CustomerMemory、【最近购买记录】与【当前推荐套餐】（均含数据依据）；问价/购买时只引用【当前推荐套餐】；按 NEW/INTERESTED/COMPARING/READY_TO_BUY/CUSTOMER 组织话术；A/B/C 能力只引用 ModelConfig/ModelCapability；禁止臆造；竞品不攻击；未命中竞品价格时禁止编造报价或便宜比例；未就绪先问诊；必须执行【转化动作】：只推荐最终套餐，禁止罗列全部套餐目录。`,
  ]
    .filter(Boolean)
    .join("\n\n");

  console.log(
    `[sales:pipeline] intent=${decision.intent} customer=${decision.customerType} level=${customerLevel.level} usage=${usageEstimate.usageLevel} exceed=${usageEstimate.exceedHistory} push=${finalDecision.pushStrategy} cta=${conversion.ctaIntensity} cards=${conversion.showProducts} pkg=${packageRecommend.recommendedPackage?.name ?? "-"} upsell=${upsellCheck.shouldUpsell} rule=${recommendHit?.ruleName ?? "-"} mem=${customerMemory ? "yes" : "no"} orders=${recentOrders.length} consumed=${consumedTokens} balance=${options?.tokenBalance ?? "n/a"} strat=${matchedStrategies.length} kg=${knowledgeHits.length}`,
  );

  const toolResult: { toolName?: string; success?: boolean } | null = null;
  if (options?.userId) {
    try {
      await prisma.agentLog.create({
        data: {
          userId: options.userId,
          message,
          intent: decision.intent,
          toolUsed: toolResult?.toolName ?? null,
          toolSuccess: toolResult?.success ?? null,
          recommendedPackageId: finalDecision.package?.id ?? null,
          pushStrategy: finalDecision.pushStrategy,
          purchased: false,
        },
      });
    } catch (error) {
      console.error("[agent-log]", error);
    }
  }

  return {
    decision,
    analysis,
    modelConfigs,
    recommendHit,
    customerMemory,
    packageRecommend,
    packageUpgrade,
    customerLevel,
    usageEstimate,
    finalDecision,
    conversion,
    promptContext,
    meta: {
      intent: decision.intent,
      customerType: decision.customerType,
      industry: signals.industry,
      budget: signals.budget,
      techLevel: signals.techLevel,
      recommended: highlight,
      recommendedPackage: packageRecommend.recommendedPackage?.name ?? null,
      packageRecommendReason: packageRecommend.reason,
      readyToRecommend: decision.readyToRecommend,
      knowledgeHitCount: knowledgeHits.length,
      competitorHitCount: competitorHits.length,
      strategyHitCount: matchedStrategies.length,
      ruleHit: recommendHit?.ruleName ?? null,
      modelCompare: Boolean(wantCompare),
      hasCustomerMemory: Boolean(customerMemory),
      customerLevel: customerLevel.level,
      usageIntensity: usageEstimate.usageLevel,
      usageExceedsLastPackage: usageEstimate.exceedHistory,
      pushStrategy: finalDecision.pushStrategy,
      showProductCards: conversion.showProducts,
      conversionCta: conversion.ctaIntensity,
      recommendedPackageId: conversion.products[0]?.id ?? null,
      rechargePath: conversion.rechargePath,
    },
  };
}

function rebuildDecisionPrompt(decision: SalesDecision): string {
  const rec = decision.recommendation;
  const recLine = rec.primary
    ? `主推：${rec.primary}
备选：${rec.alternatives.join(" / ") || "无"}
理由：${rec.reason}`
    : `暂不直接推荐。理由：${rec.reason}
建议先问：${decision.clarifyingQuestions.join("；") || "需求/场景/预算/技术水平"}`;

  return `【本轮销售决策】
销售意图：${decision.intent}
客户类型：${decision.customerType}
是否可直接推荐：${decision.readyToRecommend ? "是" : "否（先问诊）"}
${recLine}
【说明】详细话术与准则见下方 SalesStrategy / CustomerProfile；模型事实见 ModelConfig / ModelCapability。`;
}

function buildRecommendBlock(
  highlight: string | null,
  configs: ModelConfigRow[],
  hit: RecommendHit | null,
  signals: ReturnType<typeof extractCustomerDemandSignals>,
): string {
  if (!highlight) {
    return `【模型推荐】信息不足。请按 CustomerProfile 追问需求/预算/行业/技术水平后再推荐。`;
  }

  const row = configs.find((c) => c.serviceType === highlight);
  if (!row) {
    return `【模型推荐】倾向 ${highlight}（ModelConfig 未命中该档）。规则：${hit?.ruleName ?? "无"}`;
  }

  return `【模型推荐结果】
推荐：${row.grade}档 · ${row.name}（${row.serviceType}）
Token：${row.tokenCost}/次｜上下文：${row.maxContext.toLocaleString()}
能力（ModelConfig）：${row.capability}
适用（ModelConfig）：${row.suitableFor}
限制（ModelConfig）：${row.limitations}
规则理由：${hit?.reason ?? "画像/决策默认"}
客户信号：行业=${signals.industry ?? "-"}；预算=${signals.budget ?? "-"}；技术=${signals.techLevel ?? "-"}；需求=${signals.needs.join("、")}`;
}
