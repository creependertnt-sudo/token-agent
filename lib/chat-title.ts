/**
 * 根据首条用户消息生成默认标题：取第一句话前 12 字。
 * 例：「帮我做一个AI客服系统，要求…」→「帮我做一个AI客服」
 */
export function generateChatTitle(message: string): string {
  const raw = message.replace(/\s+/g, " ").trim();
  if (!raw) return "新对话";

  // 第一句：到句读或换行截止
  const sentenceEnd = raw.search(/[。！？!?\n]/);
  const firstSentence =
    sentenceEnd >= 0 ? raw.slice(0, sentenceEnd).trim() : raw;
  const core = (firstSentence || raw).trim();
  if (!core) return "新对话";

  if (core.length <= 12) return core;
  return core.slice(0, 12);
}
