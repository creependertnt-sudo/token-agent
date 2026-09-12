/**
 * 流式 Markdown 安全门控：
 * 1) 半截符号先留在 pending，成对后再并入 display
 * 2) A 补丁：流式阶段 escape 标记，finalize 时一次性 unescape 再交给 ChatMarkdown
 */

/** 默认开启；设 NEXT_PUBLIC_ENABLE_STREAM_ESCAPE=false 可回滚 */
export const ENABLE_STREAM_ESCAPE =
  process.env.NEXT_PUBLIC_ENABLE_STREAM_ESCAPE !== "false";

const ESCAPE_MAP: [RegExp, string][] = [
  [/```/g, "§ESC_BCKT§"],
  [/\*\*/g, "§ESC_BOLD§"],
  [/\*/g, "§ESC_STAR§"],
  [/__/g, "§ESC_UNDER§"],
  [/`/g, "§ESC_TICK§"],
  [/\]\(/g, "§ESC_LINK_OPEN§"],
];

/**
 * 流式阶段：把 Markdown 标记换成惰性占位，避免误入解析器时半解析。
 */
export function escapeDuringStream(text: string): string {
  if (!ENABLE_STREAM_ESCAPE || !text) return text;
  let out = text;
  for (const [re, repl] of ESCAPE_MAP) {
    out = out.replace(re, repl);
  }
  return out;
}

/**
 * 流结束：恢复 Markdown 标记，供 ChatMarkdown 一次渲染。
 * 同时兼容旧版 `__ESC_*__` 占位（若历史消息残留）。
 */
export function unescapeAfterStream(text: string): string {
  if (!ENABLE_STREAM_ESCAPE || !text) return text;
  return text
    .replace(/§ESC_BCKT§/g, "```")
    .replace(/§ESC_BOLD§/g, "**")
    .replace(/§ESC_STAR§/g, "*")
    .replace(/§ESC_UNDER§/g, "__")
    .replace(/§ESC_TICK§/g, "`")
    .replace(/§ESC_LINK_OPEN§/g, "](")
    .replace(/__ESC_BCKT__/g, "```")
    .replace(/__ESC_BOLD__/g, "**")
    .replace(/__ESC_STAR__/g, "*")
    .replace(/__ESC_UNDER__/g, "__")
    .replace(/__ESC_TICK__/g, "`")
    .replace(/__ESC_LINK_OPEN__/g, "](");
}

/**
 * 是否存在未闭合的代码围栏、粗体、或链接括号（用于流式改用 <pre>）。
 * 对已 escape 的文本会先还原再检测。
 */
export function hasUnclosedFenceOrLink(buffer: string): boolean {
  if (!buffer) return false;
  const text = unescapeAfterStream(buffer);
  const fenceCount = (text.match(/```/g) || []).length;
  if (fenceCount % 2 === 1) return true;
  const boldCount = (text.match(/\*\*/g) || []).length;
  if (boldCount % 2 === 1) return true;
  if (/\[[^\]]*\]\([^)]*$/.test(text)) return true;
  if (/\[[^\]]*$/.test(text)) return true;
  const openBracket = (text.match(/\[/g) || []).length;
  const closeBracket = (text.match(/\]/g) || []).length;
  if (openBracket > closeBracket) return true;
  return false;
}

/** 忽略列表 bullet（行首 * + 空白），避免 `* item` 永远不成对 */
function starsForPairCheck(text: string): string {
  return text.replace(/(^|\n)([ \t]*)\*(?=[ \t])/g, "$1$2");
}

/**
 * 当前文本是否可安全展示（无半截强调 / 代码块 / 链接）。
 */
export function isMarkdownSafe(text: string): boolean {
  if (!text) return true;

  // 0. ** 成对
  if (((text.match(/\*\*/g) || []).length) % 2 !== 0) {
    return false;
  }

  // 1. 剩余 * 成对（列表 bullet 不计入）
  const withoutBold = text.replace(/\*\*/g, "");
  if ((starsForPairCheck(withoutBold).match(/\*/g) || []).length % 2 !== 0) {
    return false;
  }

  // 2. ``` 成对
  if ((text.match(/```/g) || []).length % 2 !== 0) {
    return false;
  }

  // 3. 链接未闭合：[text](url
  if (/\[[^\]]*\]\([^)]*$/.test(text)) return false;

  // 3b. 半截 [text
  if (/\[[^\]]*$/.test(text)) return false;

  return true;
}

/**
 * 追加 chunk：仅当 pending 整体安全时才并入 display。
 */
export function appendSafeMarkdownStream(
  displayText: string,
  pendingText: string,
  chunk: string,
): { displayText: string; pendingText: string } {
  const pending = `${pendingText}${chunk}`;
  if (isMarkdownSafe(pending)) {
    return {
      displayText: `${displayText}${pending}`,
      pendingText: "",
    };
  }
  return { displayText, pendingText: pending };
}

/**
 * 将已有全文拆成可展示前缀 + 半截后缀（兼容旧调用）。
 */
export function splitStreamingMarkdown(content: string): {
  markdown: string;
  pending: string;
} {
  if (!content) return { markdown: "", pending: "" };
  if (isMarkdownSafe(content)) {
    return { markdown: content, pending: "" };
  }

  for (let i = content.length - 1; i >= 0; i -= 1) {
    const head = content.slice(0, i);
    if (isMarkdownSafe(head)) {
      return { markdown: head, pending: content.slice(i) };
    }
  }
  return { markdown: "", pending: content };
}
