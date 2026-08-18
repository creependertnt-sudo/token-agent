/**
 * 短期对话记忆工具。
 * 上下文硬限制：最近 20 轮（用户问题 + 重要 Memory 另注入 system）。
 */

import { CONTEXT_HISTORY_ROUNDS } from "@/lib/user-quota";

/** 加载历史时取最近 N 条（20 轮 × 2），禁止一次拉全量 */
export const SHORT_TERM_FETCH_MAX_MESSAGES = CONTEXT_HISTORY_ROUNDS * 2;

/** 默认轮数 */
export const DEFAULT_MEMORY_ROUNDS = CONTEXT_HISTORY_ROUNDS;

export function memoryRoundsToMessageLimit(rounds: number): number {
  const n = Number.isFinite(rounds) ? Math.floor(rounds) : DEFAULT_MEMORY_ROUNDS;
  const safe = Math.min(Math.max(n, 1), CONTEXT_HISTORY_ROUNDS);
  return safe * 2;
}

/** 按轮数截取最近消息（保持时间顺序） */
export function takeShortTermMessages<T>(
  messages: T[],
  rounds: number = DEFAULT_MEMORY_ROUNDS,
): T[] {
  const limit = memoryRoundsToMessageLimit(rounds);
  if (messages.length <= limit) return messages;
  return messages.slice(-limit);
}

/** Prisma take+asc 会拿到最旧消息；先 desc 再倒回时间序。 */
export function chronologicalRecent<T>(newestFirst: T[]): T[] {
  return [...newestFirst].reverse();
}

/**
 * 去掉模型思考过程，只保留最终回答（不改 UI，在 API 落库/返回前清洗）。
 */
export function stripReasoningFromReply(text: string): string {
  let out = text ?? "";
  out = out.replace(/<think>[\s\S]*?<\/think>/gi, "");
  out = out.replace(/<\/?think>/gi, "");
  out = out.replace(
    /^\s*思考过程[：:][\s\S]*?(?=\n\s*最终回答[：:]|\n\s*回答[：:]|$)/i,
    "",
  );
  out = out.replace(/^\s*最终回答[：:]\s*/i, "");
  out = out.replace(/^\s*回答[：:]\s*/i, "");
  return out.trim();
}

export function extractFinalAssistantContent(message: {
  content?: string | null;
  reasoning_content?: string | null;
} | null | undefined): string {
  const content = message?.content?.trim() ?? "";
  return stripReasoningFromReply(content);
}
