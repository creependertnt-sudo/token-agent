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
import {
  formatPackagesForPrompt,
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

export type SalesPipelineResult = {
  decision: SalesDecision;
  analysis: CustomerDemandAnalysis;
  modelConfigs: ModelConfigRow[];
  recommendHit: RecommendHit | null;
  /** 合并注入 system prompt 的上下文 */
  promptContext: string;
  meta: {
    intent: string;
    customerType: string;
    industry: string | null;
    budget: string | null;
    techLevel: string | null;
    recommended: string | null;
    readyToRecommend: boolean;
    knowledgeHitCount: number;
    competitorHitCount: number;
    strategyHitCount: number;
    ruleHit: string | null;
    modelCompare: boolean;
  };
};

/**
 * SALES 标准流水线（数据库驱动）：
 * 用户问题 → 意图识别 → 查询数据库 → 获取模型/套餐/竞品 → 生成销售回复上下文
 * 保留 SalesKnowledge RAG；A/B/C 介绍与区别禁止写死。
 */
export async function runSalesPipeline(
  message: string,
): Promise<SalesPipelineResult> {
  // 1) 意图识别（规则分类，决定后续查哪些库）
  const decision = buildSalesDecision(message);
  const signals = extractCustomerDemandSignals(message);

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
  ] = await Promise.all([
    searchSalesKnowledge({
      query: message,
      limit: 5,
      preferredCategories: decision.knowledgeCategories,
    }),
    listModelConfigs(),
    listModelCapabilities(),
    wantCompetitors
      ? searchCompetitorKnowledge({ query: message, limit: 4 })
      : Promise.resolve([]),
    listSalesStrategies(),
    listCustomerProfiles(),
    listModelRecommendRules(),
    decision.intent === "PRICE_QUERY" ||
    /套餐|充值|购买|价格|多少钱/.test(message)
      ? listActivePackages()
      : Promise.resolve([]),
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

  const packageBlock =
    packages.length > 0
      ? `【套餐目录 TokenPackage】\n${formatPackagesForPrompt(packages)}`
      : "";

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

  // 5) 合并上下文 → 供 LLM 生成销售回复
  const promptContext = [
    `【流水线】用户问题 → 意图识别 → 查询数据库 → 模型/套餐/竞品 → 销售回复`,
    decision.promptBlock,
    formatCustomerProfileForPrompt(profile),
    signals.promptBlock,
    formatRecommendRuleHitForPrompt(recommendHit),
    recommendBlock,
    `【销售策略 SalesStrategy】\n${formatSalesStrategiesForPrompt(matchedStrategies)}`,
    `【模型配置 ModelConfig】\n${formatModelConfigsForPrompt(modelConfigs, highlight)}`,
    `【模型能力 ModelCapability】\n${formatModelCapabilitiesForPrompt(capabilities, highlight)}`,
    comparisonBlock,
    packageBlock,
    `【竞品知识 CompetitorKnowledge】\n${formatCompetitorsForPrompt(competitorHits)}`,
    `【销售知识 RAG SalesKnowledge】\n${formatSalesKnowledgeForPrompt(knowledgeHits)}`,
    `【硬规则】A/B/C 介绍、能力区别、适用场景只引用 ModelConfig/ModelCapability；禁止臆造；竞品不攻击；未就绪先问诊。`,
  ]
    .filter(Boolean)
    .join("\n\n");

  console.log(
    `[sales:pipeline] intent=${decision.intent} customer=${decision.customerType} industry=${signals.industry} budget=${signals.budget} tech=${signals.techLevel} recommend=${highlight ?? "ask"} rule=${recommendHit?.ruleName ?? "-"} strat=${matchedStrategies.length} kg=${knowledgeHits.length} cap=${capabilities.length} cfg=${modelConfigs.length} comp=${competitorHits.length}`,
  );

  return {
    decision,
    analysis,
    modelConfigs,
    recommendHit,
    promptContext,
    meta: {
      intent: decision.intent,
      customerType: decision.customerType,
      industry: signals.industry,
      budget: signals.budget,
      techLevel: signals.techLevel,
      recommended: highlight,
      readyToRecommend: decision.readyToRecommend,
      knowledgeHitCount: knowledgeHits.length,
      competitorHitCount: competitorHits.length,
      strategyHitCount: matchedStrategies.length,
      ruleHit: recommendHit?.ruleName ?? null,
      modelCompare: Boolean(wantCompare),
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
