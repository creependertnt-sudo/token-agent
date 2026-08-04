import {
  FEATURE_TOKEN_COST,
  type PremiumFeature,
} from "@/lib/constants";

export type ChatIntent =
  | "free"
  | "purchase"
  | "recharge"
  | "insufficient"
  | "analysis"
  | "writing"
  | "model";

const PURCHASE_KEYWORDS = [
  "购买",
  "买",
  "下单",
  "付款",
  "支付",
  "套餐",
  "多少钱",
  "价格",
  "充值",
  "续费",
  "推荐套餐",
  "有哪些套餐",
];

const MODEL_KEYWORDS = [
  "模型",
  "gpt",
  "claude",
  "sonnet",
  "grok",
  "gemini",
  "openai",
  "anthropic",
  "xai",
  "google",
  "厂商",
  "有哪些模型",
  "推荐模型",
  "上下文",
];

const ANALYSIS_KEYWORDS = [
  "业务分析",
  "深度分析",
  "分析一下",
  "帮我分析",
  "需求分析",
  "竞品分析",
  "市场分析",
];

const WRITING_KEYWORDS = [
  "写一个",
  "帮我写",
  "撰写",
  "销售方案",
  "营销文案",
  "产品介绍",
  "广告标题",
  "写作",
  "方案生成",
];

export function detectChatIntent(message: string): ChatIntent {
  const text = message.trim().toLowerCase();

  if (WRITING_KEYWORDS.some((k) => text.includes(k.toLowerCase()))) {
    return "writing";
  }
  if (ANALYSIS_KEYWORDS.some((k) => text.includes(k.toLowerCase()))) {
    return "analysis";
  }
  if (
    text.includes("余额不足") ||
    text.includes("token不足") ||
    text.includes("额度不足")
  ) {
    return "insufficient";
  }
  // 价格/套餐优先于泛化「模型」词，避免「GPT套餐多少钱」判成 model
  if (PURCHASE_KEYWORDS.some((k) => text.includes(k.toLowerCase()))) {
    return "purchase";
  }
  if (MODEL_KEYWORDS.some((k) => text.includes(k.toLowerCase()))) {
    return "model";
  }
  return "free";
}

export function shouldShowProductCards(intent: ChatIntent): boolean {
  // 仅明确购买/充值/余额不足时展示卡片；写作/分析应走问诊推荐，不甩套餐
  return (
    intent === "purchase" ||
    intent === "recharge" ||
    intent === "insufficient"
  );
}

/**
 * 仅用于售前展示/历史兼容。
 * 禁止用于 chat 扣费或模型升级（扣费必须按 AIService.type）。
 */
export function intentToPremiumFeature(
  intent: ChatIntent,
): PremiumFeature | null {
  if (intent === "analysis") return "analysis";
  if (intent === "writing") return "writing";
  return null;
}

/** 仅 /api/writer 等功能入口使用；chat 请用 getLockedTokenCost */
export function getFeatureCost(feature: PremiumFeature) {
  return FEATURE_TOKEN_COST[feature];
}
