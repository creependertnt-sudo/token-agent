export type ChatRole = "user" | "assistant";

export type ProductSuggestion = {
  id: string;
  name: string;
  tokenAmount: number;
  price: number;
  conversionId?: string | null;
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
  /** 正在接收 SSE 流 */
  streaming?: boolean;
  /** 尚未出现首个正文 token */
  thinking?: boolean;
};

export type AuthUser = {
  id: string;
  email: string;
  nickname?: string | null;
  avatar?: string | null;
  /** light | dark | system */
  theme?: string | null;
  tokenBalance: number;
  freeChatCount: number;
  /** USER | ADMIN；缺省按普通用户 */
  role?: string | null;
};
