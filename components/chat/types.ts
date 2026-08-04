export type ChatRole = "user" | "assistant";

export type ProductSuggestion = {
  id: string;
  name: string;
  tokenAmount: number;
  price: number;
};

export type ChatServiceTypeLabel =
  | "SALES"
  | "LIGHT"
  | "STANDARD"
  | "PREMIUM"
  | string;

/**
 * 前端消息。助手消息应带上「发送时」锁定的模型快照，
 * 禁止用顶部当前选中模型覆盖历史消息展示。
 */
export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: string;
  products?: ProductSuggestion[];
  /** 生成时锁定的 serviceType（仅 assistant） */
  serviceType?: ChatServiceTypeLabel | null;
  /** 生成时展示名，如 C模型AI */
  modelName?: string | null;
  /** 本条实际扣费 */
  tokenCost?: number | null;
  /** 本条扣费后余额（可选；新消息可从接口写入） */
  tokenBalanceAfter?: number | null;
};

export type AuthUser = {
  id: string;
  email: string;
  nickname?: string | null;
  avatar?: string | null;
  tokenBalance: number;
  freeChatCount: number;
};
