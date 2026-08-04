export const INITIAL_TOKEN_BALANCE = 0;
export const INITIAL_FREE_CHAT_COUNT = 20;
export const SESSION_COOKIE_NAME = "token_agent_session";

/**
 * 全站唯一服务配置来源。
 * prompt / 扣费 / 展示名称必须全部读这里，禁止写死 PREMIUM 等默认身份。
 */
export const SERVICE_CONFIG = {
  SALES: {
    name: "销售客服",
    cost: 0,
    capability: "销售转化顾问：了解需求、推荐模型、指导购买",
  },
  LIGHT: {
    name: "A模型AI",
    cost: 5,
    /** 展示/计费用短标签；完整能力以 ModelConfig/ModelCapability 为准 */
    capability: "见数据库 ModelConfig（LIGHT）",
  },
  STANDARD: {
    name: "B模型AI",
    cost: 20,
    capability: "见数据库 ModelConfig（STANDARD）",
  },
  PREMIUM: {
    name: "C模型AI",
    cost: 50,
    capability: "见数据库 ModelConfig（PREMIUM）",
  },
} as const;

export type ChatServiceType = keyof typeof SERVICE_CONFIG;

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

export const WELCOME_MESSAGE = `你好，我是 Token AI 客服。

我可以帮助你：

- 查询 Token 套餐与价格（实时数据库）
- 介绍可售 AI 模型与厂商
- 推荐购买方案
- 在顶栏切换 SALES / LIGHT / STANDARD / PREMIUM 通道

扣费以你选择的通道为准（LIGHT=5 / STANDARD=20 / PREMIUM=50 / SALES=免费），不会因问题复杂而自动升级。`;
