export const INITIAL_TOKEN_BALANCE = 0;
export const INITIAL_FREE_CHAT_COUNT = 20;
export const SESSION_COOKIE_NAME = "token_agent_session";

/**
 * 全站唯一服务配置来源。
 * prompt / 扣费 / 展示名称必须全部读这里，禁止写死 PREMIUM 等默认身份。
 * 用户可见名称请用 MODEL_LABEL / SERVICE_UI_LABEL，勿再写 A/B/C。
 */
export const SERVICE_CONFIG = {
  SALES: {
    name: "Guide",
    cost: 0,
    capability: "销售转化顾问：了解需求、推荐模型、指导购买",
  },
  LIGHT: {
    name: "Alpha",
    cost: 5,
    /** 展示/计费用短标签；完整能力以 ModelConfig/ModelCapability 为准 */
    capability: "见数据库 ModelConfig（LIGHT）",
  },
  STANDARD: {
    name: "Beta",
    cost: 20,
    capability: "见数据库 ModelConfig（STANDARD）",
  },
  PREMIUM: {
    name: "Gamma",
    cost: 50,
    capability: "见数据库 ModelConfig（PREMIUM）",
  },
} as const;

export type ChatServiceType = keyof typeof SERVICE_CONFIG;

/**
 * 用户可见模型名（内部枚举仍为 LIGHT / STANDARD / PREMIUM / SALES）。
 * UI 一律：MODEL_LABEL[serviceType]
 */
export const MODEL_LABEL: Record<ChatServiceType, string> = {
  LIGHT: "Alpha",
  STANDARD: "Beta",
  PREMIUM: "Gamma",
  SALES: "Guide",
};

/** @deprecated 请用 MODEL_LABEL；保留别名避免旧引用漏改 */
export const SERVICE_UI_LABEL = MODEL_LABEL;

/** 模型名下的弱提示 */
export const SERVICE_UI_HINT: Record<ChatServiceType, string> = {
  LIGHT: "快速响应",
  STANDARD: "均衡推荐",
  PREMIUM: "高性能处理",
  SALES: "智能推荐",
};

/** UI 色调标识（样式 data-tone） */
export const SERVICE_UI_TONE: Record<ChatServiceType, string> = {
  LIGHT: "alpha",
  STANDARD: "beta",
  PREMIUM: "gamma",
  SALES: "guide",
};

export function getServiceUiLabel(
  type: string | null | undefined,
  fallback = "—",
): string {
  if (type && type in MODEL_LABEL) {
    return MODEL_LABEL[type as ChatServiceType];
  }
  return fallback;
}

export function getServiceUiHint(
  type: string | null | undefined,
  fallback = "",
): string {
  if (type && type in SERVICE_UI_HINT) {
    return SERVICE_UI_HINT[type as ChatServiceType];
  }
  return fallback;
}

/** @deprecated 请用 SERVICE_CONFIG[type].cost */
export const SERVICE_TOKEN_COST = {
  SALES: SERVICE_CONFIG.SALES.cost,
  LIGHT: SERVICE_CONFIG.LIGHT.cost,
  STANDARD: SERVICE_CONFIG.STANDARD.cost,
  PREMIUM: SERVICE_CONFIG.PREMIUM.cost,
} as const;

/** @deprecated 请用 SERVICE_CONFIG[type].name */
export const SERVICE_DISPLAY_NAME = {
  SALES: SERVICE_CONFIG.SALES.name,
  LIGHT: SERVICE_CONFIG.LIGHT.name,
  STANDARD: SERVICE_CONFIG.STANDARD.name,
  PREMIUM: SERVICE_CONFIG.PREMIUM.name,
} as const;

/**
 * 各档位生成硬限制（隔离能力，不切换底层模型）。
 */
export const SERVICE_GENERATION_LIMITS = {
  SALES: { maxTokens: 900, temperature: 0.55, maxChars: 2200 },
  LIGHT: { maxTokens: 220, temperature: 0.2, maxChars: 420 },
  STANDARD: { maxTokens: 1100, temperature: 0.5, maxChars: 2800 },
  PREMIUM: { maxTokens: 3500, temperature: 0.6, maxChars: 12000 },
} as const;

/** 兼容旧调用；chat 请用 SERVICE_CONFIG */
export const FEATURE_TOKEN_COST = {
  light: SERVICE_CONFIG.LIGHT.cost,
  standard: SERVICE_CONFIG.STANDARD.cost,
  premium: SERVICE_CONFIG.PREMIUM.cost,
  analysis: 10,
  writing: 50,
} as const;

export type PremiumFeature = keyof typeof FEATURE_TOKEN_COST;

/** 空状态主文案（结构渲染见 MessageList） */
export const WELCOME_PRIMARY =
  "从一个问题开始，我可以帮你逐步完成一个项目";
export const WELCOME_SECONDARY = "你可以从这些开始 👇";

/** @deprecated 兼容旧引用；UI 请用 WELCOME_PRIMARY / WELCOME_SECONDARY */
export const WELCOME_MESSAGE = `${WELCOME_PRIMARY}\n${WELCOME_SECONDARY}`;

export const STARTER_HINT =
  "试试这些开始：做一个 AI 客服系统";
export const STARTER_HINT_STORAGE_KEY = "mira_starter_hint_done";
/** 与 STARTER_HINT 对应的一键发送文案 */
export const STARTER_HINT_PROMPT =
  "我想做一个 AI 客服系统，请先给整体方案，再列出关键步骤和下一步。";
