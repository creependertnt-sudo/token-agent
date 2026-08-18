import { SERVICE_CONFIG } from "@/lib/constants";
import type { CustomerDemandSignals } from "@/lib/customer-analysis";
import type { UsageEstimate } from "@/lib/usage-estimator";

/** SALES 销售意图 */
export const SALES_INTENTS = [
  "PRICE_QUERY",
  "PRODUCT_COMPARE",
  "MODEL_SELECT",
  "TECH_REQUIREMENT",
  "ENTERPRISE_PLAN",
  "GENERAL_CHAT",
] as const;

export type SalesIntent = (typeof SALES_INTENTS)[number];

/** 客户类型（回复前判断） */
export const CUSTOMER_TYPES = [
  "STUDENT",
  "INDIVIDUAL_DEV",
  "STARTUP_TEAM",
  "ENTERPRISE",
  "UNKNOWN",
] as const;

export type CustomerType = (typeof CUSTOMER_TYPES)[number];

export type RecommendedTier = "LIGHT" | "STANDARD" | "PREMIUM";

export type SalesDecision = {
  intent: SalesIntent;
  customerType: CustomerType;
  signals: {
    needsCode: boolean | null;
    budgetLow: boolean | null;
    budgetHigh: boolean | null;
    enterprise: boolean | null;
    lightUse: boolean | null;
    heavyArch: boolean | null;
  };
  /** 信息是否足够直接推荐；不足则应先问诊 */
  readyToRecommend: boolean;
  clarifyingQuestions: string[];
  recommendation: {
    primary: RecommendedTier | null;
    alternatives: RecommendedTier[];
    reason: string;
  };
  /** 知识库优先检索类别 */
  knowledgeCategories: string[];
  /** 注入 prompt 的决策与话术 */
  promptBlock: string;
};

const INTENT_LABEL: Record<SalesIntent, string> = {
  PRICE_QUERY: "价格/套餐咨询",
  PRODUCT_COMPARE: "产品/竞品对比",
  MODEL_SELECT: "模型选型",
  TECH_REQUIREMENT: "技术需求沟通",
  ENTERPRISE_PLAN: "企业方案",
  GENERAL_CHAT: "一般咨询",
};

const CUSTOMER_LABEL: Record<CustomerType, string> = {
  STUDENT: "学生/轻度用户",
  INDIVIDUAL_DEV: "个人开发者",
  STARTUP_TEAM: "创业小团队",
  ENTERPRISE: "企业客户",
  UNKNOWN: "未明确（需问诊）",
};

const COMPETITOR_ENTITY_RE =
  /openai|chatgpt|gpt-4o|gpt-4|\bgpt\b|claude|gemini|deepseek|coze|dify|fastgpt|chatbase|扣子/;
const COMPARE_CUE_RE =
  /相比|对比|区别|差异|哪个好|便宜|贵不贵|贵|成本|价格差|价格对比|差多少|优势|(?:^|[^如])比/;

/** 点名竞品 + 比较/贵便宜 → 竞品对比（优先于普通问价） */
export function isCompetitorCompareQuestion(message: string): boolean {
  const t = message.trim().toLowerCase();
  return COMPETITOR_ENTITY_RE.test(t) && COMPARE_CUE_RE.test(t);
}

/**
 * 销售意图识别（规则分类，供 RAG 加权与决策）。
 */
export function detectSalesIntent(message: string): SalesIntent {
  const t = message.trim().toLowerCase();

  if (
    /企业|公司|团队采购|批量|代理商|私有化|部署|合规|采购|招投标|to\s*b|b2b|多人|员工|部门|商业使用|企业账号|\d+\s*个人/.test(
      t,
    )
  ) {
    return "ENTERPRISE_PLAN";
  }
  if (
    /coze|扣子|dify|fastgpt|chatbase|竞品|和其他|别的\s*ai|市面/.test(t)
  ) {
    return "PRODUCT_COMPARE";
  }
  // 点名外部竞品 + 比/便宜/区别：不要被「便宜」带进 PRICE_QUERY
  if (isCompetitorCompareQuestion(t)) {
    return "PRODUCT_COMPARE";
  }
  // A/B/C 内部对比优先走选型（差异从 ModelConfig 读）
  if (
    /哪个模型|适合我|推荐模型|选哪个|light|standard|premium|a模型|b模型|c模型|a\s*和\s*c|a\s*和\s*b|b\s*和\s*c|有什么区别|差在哪|哪个强/.test(
      t,
    )
  ) {
    return "MODEL_SELECT";
  }
  if (
    /套餐|价格|多少钱|充值|购买|想买|买token|费用|计费|便宜|贵不贵|token\s*多少/.test(
      t,
    )
  ) {
    return "PRICE_QUERY";
  }
  if (/对比|区别/.test(t) && /模型|档|light|standard|premium|[abc]/.test(t)) {
    return "MODEL_SELECT";
  }
  if (/对比|区别/.test(t)) {
    return "PRODUCT_COMPARE";
  }
  if (
    /网站|系统|架构|数据库|代码|开发|算法|api|后端|前端|部署|项目|做一个|想做|技术|需求分析/.test(
      t,
    )
  ) {
    return "TECH_REQUIREMENT";
  }
  return "GENERAL_CHAT";
}

function inferSignals(message: string) {
  const t = message.trim().toLowerCase();
  const needsCode = /代码|开发|编程|写程序|改代码|api|数据库|架构/.test(t)
    ? true
    : /文案|翻译|问答|作业|聊天/.test(t)
      ? false
      : null;
  const budgetLow = /便宜|省钱|学生|试用|尝鲜|入门|预算低|穷/.test(t)
    ? true
    : null;
  const budgetHigh = /不差钱|企业预算|高端|顶级|高级方案|愿意付费/.test(t)
    ? true
    : null;
  const enterprise =
    /企业|公司|团队|私有化|合规|采购|多人|员工|部门|商业使用|企业账号|批量|\d+\s*个人/.test(
      t,
    )
      ? true
      : null;
  const lightUse = /偶尔|轻度|简单|翻译|文案|作业|学生/.test(t) ? true : null;
  const heavyArch =
    /大型|架构|复杂算法|企业级|微服务|分布式|高并发/.test(t) ? true : null;

  return {
    needsCode,
    budgetLow,
    budgetHigh,
    enterprise,
    lightUse,
    heavyArch,
  };
}

/**
 * 客户类型判断。
 */
export function detectCustomerType(
  message: string,
  signals = inferSignals(message),
): CustomerType {
  if (signals.enterprise) return "ENTERPRISE";
  if (signals.heavyArch) return "ENTERPRISE";
  if (signals.lightUse && signals.needsCode === false) return "STUDENT";
  if (/学生|作业|课程/.test(message)) return "STUDENT";
  if (/团队|创业|startup|小公司/.test(message.toLowerCase())) {
    return "STARTUP_TEAM";
  }
  if (signals.needsCode || /程序员|开发者|engineer|做项目/.test(message)) {
    return "INDIVIDUAL_DEV";
  }
  return "UNKNOWN";
}

/**
 * 根据需求/预算/场景推荐 — 具体档位由 ModelRecommendRule 数据库决定。
 * 此处仅占位，避免在代码写死能力介绍。
 */
export function recommendModelChannel(_input: {
  customerType: CustomerType;
  signals: ReturnType<typeof inferSignals>;
  intent: SalesIntent;
}): SalesDecision["recommendation"] {
  return {
    primary: null,
    alternatives: ["LIGHT", "STANDARD", "PREMIUM"],
    reason:
      "推荐档位由 ModelRecommendRule / CustomerProfile 数据库匹配后注入，禁止使用代码内写死的能力文案。",
  };
}

function clarifyingQuestionsFor(
  intent: SalesIntent,
  customerType: CustomerType,
  ready: boolean,
): string[] {
  if (ready && intent !== "GENERAL_CHAT" && intent !== "TECH_REQUIREMENT") {
    return [];
  }

  const base = [
    "你的使用场景更偏学习问答、个人开发，还是企业方案？",
    "是否需要写代码 / 做架构设计？",
    "预算更在意省着用，还是追求方案深度？",
  ];

  if (intent === "TECH_REQUIREMENT") {
    return [
      "项目类型是官网、后台、App，还是别的？",
      "是否需要写代码或改代码？",
      "使用频率大概怎样？偶尔还是每天高强度？",
      "预算大概什么范围？",
    ];
  }
  if (intent === "ENTERPRISE_PLAN") {
    return [
      "大概团队规模与使用人数？",
      "是否有私有化/合规要求？",
      "更看重开发效率，还是企业级架构深度？",
    ];
  }
  if (customerType === "UNKNOWN") return base;
  return base.slice(0, 2);
}

function knowledgeCategoriesFor(intent: SalesIntent): string[] {
  switch (intent) {
    case "PRICE_QUERY":
      return ["pricing", "faq", "product"];
    case "PRODUCT_COMPARE":
      return ["competitor", "script", "product", "model_diff"];
    case "MODEL_SELECT":
      return ["model_diff", "faq", "script"];
    case "TECH_REQUIREMENT":
      return ["model_diff", "faq", "product"];
    case "ENTERPRISE_PLAN":
      return ["pricing", "competitor", "product", "script"];
    default:
      return ["product", "faq", "model_diff"];
  }
}

/** 竞品话术占位：正文来自 CompetitorKnowledge / SalesStrategy */
export function competitorTalkTrack(mentioned?: string | null): string {
  const name = mentioned?.trim();
  return name
    ? `谈到 ${name}：请严格使用下方 CompetitorKnowledge 条目，禁止贬低竞品。条目未写明对方价格时，禁止猜测报价或编造价格差。`
    : "竞品对比请严格使用下方 CompetitorKnowledge / SalesStrategy，禁止贬低竞品。未命中的竞品价格一律视为未知，禁止编造。先比较能力、计费方式、使用场景，再引导 API 调用 / AI 客服 / Token 套餐。";
}

function buildPromptBlock(decision: Omit<SalesDecision, "promptBlock">): string {
  const rec = decision.recommendation;
  const recLine = rec.primary
    ? `主推：${rec.primary}（${SERVICE_CONFIG[rec.primary].name}，${SERVICE_CONFIG[rec.primary].cost} Token/次）
备选：${rec.alternatives.join(" / ") || "无"}
理由：${rec.reason}`
    : `暂不直接推荐具体档位。理由：${rec.reason}
建议先问：${decision.clarifyingQuestions.join("；") || "需求/场景/预算/技术水平"}`;

  const talk =
    decision.intent === "PRODUCT_COMPARE"
      ? `\n【竞品话术】\n${competitorTalkTrack()}`
      : decision.intent === "PRICE_QUERY"
        ? `\n【价格话术】先确认使用场景，再给套餐；避免一上来甩完整价目表。明确购买意图时只引用【当前推荐套餐】并引导 /recharge。`
        : decision.intent === "MODEL_SELECT" || decision.readyToRecommend
          ? `\n【推荐话术】用「根据你的场景，更建议 …」说明；引导顶栏切换；需要额度再提充值。`
          : `\n【问诊话术】先理解需求，再推荐；每次 2～4 个短问题。`;

  return `【本轮销售决策】
销售意图：${decision.intent}（${INTENT_LABEL[decision.intent]}）
客户类型：${decision.customerType}（${CUSTOMER_LABEL[decision.customerType]}）
信号：需要代码=${String(decision.signals.needsCode)}；低预算=${String(decision.signals.budgetLow)}；企业=${String(decision.signals.enterprise)}；重度架构=${String(decision.signals.heavyArch)}
是否可直接推荐：${decision.readyToRecommend ? "是" : "否（先问诊）"}
${recLine}
${talk}

【决策执行规则】
1. 严格按上述意图与客户类型组织回复
2. PRODUCT_COMPARE：不攻击竞品；未命中竞品价格则禁止编造报价或「便宜 X%」；先比较能力/计费/场景，再引导方案
3. TECH_REQUIREMENT / GENERAL_CHAT 且未就绪：先问诊，禁止直接甩套餐
4. 推荐时只引导 LIGHT/STANDARD/PREMIUM（付费通道），SALES 自身保持顾问身份`;
}

/**
 * SALES 回复前的完整销售决策。
 */
export function buildSalesDecision(message: string): SalesDecision {
  const intent = detectSalesIntent(message);
  const signals = inferSignals(message);
  const customerType = detectCustomerType(message, signals);
  const recommendation = recommendModelChannel({
    customerType,
    signals,
    intent,
  });

  const readyToRecommend =
    recommendation.primary !== null &&
    (intent === "MODEL_SELECT" ||
      intent === "PRICE_QUERY" ||
      intent === "ENTERPRISE_PLAN" ||
      intent === "PRODUCT_COMPARE" ||
      (intent === "TECH_REQUIREMENT" &&
        (signals.needsCode !== null ||
          signals.lightUse !== null ||
          signals.heavyArch !== null ||
          customerType !== "UNKNOWN")));

  const clarifyingQuestions = clarifyingQuestionsFor(
    intent,
    customerType,
    readyToRecommend,
  );

  const partial = {
    intent,
    customerType,
    signals,
    readyToRecommend,
    clarifyingQuestions,
    recommendation,
    knowledgeCategories: knowledgeCategoriesFor(intent),
  };

  return {
    ...partial,
    promptBlock: buildPromptBlock(partial),
  };
}

/** 历史订单快照（升级推荐用） */
export type UpgradeOrderSnapshot = {
  packageName: string;
  tokenAmount: number;
};

/** 套餐升级建议：与【套餐推荐】共用同一目标套餐 */
export type PackageUpgradeAdvice = {
  previousPackageName: string;
  currentNeedLabel: string;
  recommendedPackageName: string;
  recommendedTokenAmount: number;
  recommendedPrice: number;
  message: string;
};

export type UpsellCheckResult = {
  shouldUpsell: boolean;
  upgradeReason: string | null;
  previousPackageName: string | null;
  currentNeedLabel: string | null;
  push: "STRONG" | "MEDIUM" | "SOFT" | null;
};

function isLowTierPackage(name: string, tokenAmount: number): boolean {
  if (/基础|入门|尝鲜|basic/i.test(name)) return true;
  return tokenAmount > 0 && tokenAmount <= 15_000;
}

/** 纯问价/充值咨询，不触发升级话术 */
function isPurePriceInquiry(message: string, intent: SalesIntent): boolean {
  const t = message.trim();
  if (intent !== "PRICE_QUERY") return false;
  if (/高并发|架构|分布式|微服务|复杂算法|企业级|大规模|开发|代码|系统/.test(t)) {
    return false;
  }
  return /^(套餐|价格|多少钱|充值|购买|费用|计费).{0,30}$/u.test(t);
}

function isHigherDemandContext(input: {
  message: string;
  intent: SalesIntent;
  signals: ReturnType<typeof inferSignals>;
  demandSignals: CustomerDemandSignals;
}): boolean {
  const { message, intent, signals, demandSignals } = input;
  const t = message.toLowerCase();

  if (isPurePriceInquiry(message, intent)) return false;

  if (signals.heavyArch) return true;
  if (signals.enterprise) return true;
  if (/高并发|架构设计|分布式|微服务|复杂算法|企业级|大规模调用|深度推理|高频/.test(t)) {
    return true;
  }
  if (/不够用|额度不够|token\s*不够/.test(t) && /开发|项目|代码|调用/.test(t)) {
    return true;
  }
  if (
    demandSignals.needs.some((n) =>
      /系统架构|复杂算法|代码开发|高并发/.test(n),
    )
  ) {
    return true;
  }
  if (demandSignals.techLevel === "expert") return true;
  if (
    (intent === "TECH_REQUIREMENT" || intent === "ENTERPRISE_PLAN") &&
    /开发|架构|系统|并发|算法|项目/.test(t)
  ) {
    return true;
  }
  return false;
}

function labelCurrentNeed(
  message: string,
  demandSignals: CustomerDemandSignals,
): string {
  if (/高并发/.test(message)) return "高并发调用";
  if (/分布式|微服务/.test(message)) return "分布式/微服务架构";
  if (/复杂算法|算法/.test(message)) return "复杂算法场景";
  if (/开发|代码|项目不够|不够用/.test(message)) return "代码开发";
  if (/企业级|企业方案|公司|团队|\d+\s*个人/.test(message)) return "企业/团队使用";
  if (demandSignals.needs.includes("系统架构")) return "系统架构";
  if (demandSignals.needs.includes("代码开发")) return "代码开发";
  if (demandSignals.needs.includes("复杂算法")) return "复杂算法";
  return demandSignals.needs[0] ?? "更高强度使用";
}

/**
 * 是否触发套餐升级（不决定具体套餐）。
 * 依据：用量超过历史套餐容量，或曾购低套餐 + 需求明显提高；纯问价除外。
 */
export function shouldUpsellPackage(input: {
  message: string;
  intent: SalesIntent;
  signals: ReturnType<typeof inferSignals>;
  demandSignals: CustomerDemandSignals;
  recentOrders: UpgradeOrderSnapshot[];
  usageEstimate?: UsageEstimate | null;
}): UpsellCheckResult {
  const empty = {
    shouldUpsell: false,
    upgradeReason: null,
    previousPackageName: null,
    currentNeedLabel: null,
    push: null as UpsellCheckResult["push"],
  };

  const lastOrder = input.recentOrders[0] ?? null;
  if (!lastOrder) return empty;

  if (isPurePriceInquiry(input.message, input.intent)) {
    return {
      ...empty,
      previousPackageName: lastOrder.packageName,
    };
  }

  const estimated = input.usageEstimate?.estimatedTokens ?? 0;
  const lastTokens = lastOrder.tokenAmount;
  const exceedsCapacity =
    lastTokens > 0 && estimated > lastTokens;

  const lowPurchase = input.recentOrders.find((o) =>
    isLowTierPackage(o.packageName, o.tokenAmount),
  );

  const higherDemand = isHigherDemandContext({
    message: input.message,
    intent: input.intent,
    signals: input.signals,
    demandSignals: input.demandSignals,
  });

  const shouldUpsell = exceedsCapacity || Boolean(lowPurchase && higherDemand);
  if (!shouldUpsell) {
    return {
      ...empty,
      previousPackageName: lastOrder.packageName,
    };
  }

  const currentNeedLabel = labelCurrentNeed(
    input.message,
    input.demandSignals,
  );

  let push: UpsellCheckResult["push"] = "SOFT";
  if (lastTokens > 0 && estimated > lastTokens * 1.5) push = "STRONG";
  else if (lastTokens > 0 && estimated > lastTokens * 1.2) push = "MEDIUM";

  const prev = lowPurchase ?? lastOrder;
  const upgradeReason = exceedsCapacity
    ? `${currentNeedLabel}需求超过${prev.packageName}容量（预估 ${estimated.toLocaleString()} Token > ${lastTokens.toLocaleString()} Token）`
    : `曾购 ${prev.packageName}，当前需求为 ${currentNeedLabel}，建议升级套餐`;

  return {
    shouldUpsell: true,
    upgradeReason,
    previousPackageName: prev.packageName,
    currentNeedLabel,
    push,
  };
}

/**
 * 升级推荐话术：使用 recommendTokenPackage 已选定的同一套餐。
 */
export function buildPackageUpgradeAdvice(input: {
  previousPackageName: string;
  currentNeedLabel: string;
  upgradeReason: string;
  recommendedPackage: {
    name: string;
    tokenAmount: number;
    price: number;
  };
}): PackageUpgradeAdvice {
  const { previousPackageName, currentNeedLabel, recommendedPackage } = input;
  const needClause = /开发/.test(currentNeedLabel)
    ? "当前开发需求更高"
    : `如果当前需求是${currentNeedLabel}`;
  const message = `您之前使用的是${previousPackageName}，${needClause}，建议升级到${recommendedPackage.name}（${recommendedPackage.tokenAmount.toLocaleString()} Token，¥${recommendedPackage.price}）。`;

  return {
    previousPackageName,
    currentNeedLabel,
    recommendedPackageName: recommendedPackage.name,
    recommendedTokenAmount: recommendedPackage.tokenAmount,
    recommendedPrice: recommendedPackage.price,
    message,
  };
}

export function formatPackageUpgradeForPrompt(
  advice: PackageUpgradeAdvice | null,
): string {
  if (!advice) {
    return `【升级建议】
暂不升级。纯问价或容量仍够时，不要主动强调升级。`;
  }
  return `【升级建议】
${advice.message}
（与【套餐推荐】为同一套餐；纯问价时不要主动强调升级）`;
}
