export type ChatRole = "user" | "assistant" | "system";

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
  /** 生成时内部展示名；UI 请用 SERVICE_UI_LABEL */
  modelName?: string | null;
  /** 本条实际扣费 */
  tokenCost?: number | null;
  /** 本条扣费后余额（可选；新消息可从接口写入） */
  tokenBalanceAfter?: number | null;
  /** 正在接收 SSE 流 */
  streaming?: boolean;
  /** 尚未出现首个正文 token */
  thinking?: boolean;
  /** 转化页：显示快捷 CTA */
  showQuickActions?: boolean;
  /** 本条推荐按钮已用过（点一次后隐藏，避免堆积） */
  usedActions?: boolean;
  /** 主动引导：气泡下 2~3 个下一步按钮 */
  quickActions?: QuickAction[];
  /** 顾问式软推荐小卡（非购买、非强推） */
  softRecommend?: SoftRecommend | null;
  /** 转化页：记忆提示文案 */
  memoryHint?: string | null;
  /** 重要消息置顶标记（视觉突出，不改列表顺序） */
  pinned?: boolean;
  /** 推进链元信息（任务流程跟进） */
  chainMeta?: {
    chainId: string;
    step: number;
  };
};

export type SoftRecommend = {
  id: string;
  title: string;
  body?: string;
  actionLabel?: string;
  actionPrompt?: string;
  suggestServiceType?: string;
};

export type QuickAction = {
  id: string;
  label: string;
  /** 点击后直接作为用户消息发送 */
  prompt: string;
  /** 可选：点击时切到该模型再发送（转化入口） */
  suggestServiceType?: string;
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
