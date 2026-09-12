/**
 * TTS 专用文本清洗：去掉 Markdown / 链接 / emoji / 代码符号等，
 * 避免语音引擎把标记符读出来。不修改聊天展示文案。
 *
 * 处理顺序：
 * 1. 提取 Markdown 链接文字（丢弃 URL）
 * 2. 删除裸链接 / 路径残留
 * 3. Markdown 符号清理
 * 4. Emoji 清理
 * 5. 空白收尾
 * （数字自然化在 naturalizer 中继续）
 */
export function cleanVoiceText(text: string): string {
  if (!text) return "";

  let t = text;

  // ── 1. Markdown 链接：只保留显示文字 ──
  t = stripMarkdownLinks(t);

  // ── 2. 裸 URL / 相对路径 / 查询串残留 ──
  t = stripBareUrls(t);

  // ── 3. Markdown 符号清理 ──
  t = t.replace(/```[\s\S]*?```/g, " ");
  t = t.replace(/`([^`]+)`/g, "$1");
  t = t.replace(/^#{1,6}\s*/gm, "");
  t = t.replace(/\*\*\*(.+?)\*\*\*/g, "$1");
  t = t.replace(/\*\*(.+?)\*\*/g, "$1");
  t = t.replace(/\*(.+?)\*/g, "$1");
  t = t.replace(/___(.+?)___/g, "$1");
  t = t.replace(/__(.+?)__/g, "$1");
  t = t.replace(/_(.+?)_/g, "$1");
  t = t.replace(/~~(.+?)~~/g, "$1");
  t = t.replace(/^\s*>\s?/gm, "");
  t = t.replace(/^\s*[-*+]\s+/gm, "");
  t = t.replace(/^\s*\d+[.)]\s+/gm, "");
  t = t.replace(/^[\s]*(-{3,}|\*{3,}|_{3,})[\s]*$/gm, " ");
  t = t.replace(/\|/g, " ");
  t = t.replace(/<a\b[^>]*>([\s\S]*?)<\/a>/gi, "$1");
  t = t.replace(/<\/?[^>]+>/g, " ");
  t = t.replace(/[*#`~]+/g, "");
  // 残留方括号（非链接结构）
  t = t.replace(/\[([^\[\]]+)\]/g, "$1");
  t = t.replace(/[【】〖〗\[\]]/g, "");
  t = t.replace(/(^|\s)[•●○◆◇▪▫►◀]+/g, "$1");

  // ── 4. Emoji / 装饰符号 ──
  try {
    t = t.replace(/\p{Extended_Pictographic}/gu, "");
    t = t.replace(/\p{Emoji_Presentation}/gu, "");
  } catch {
    t = t.replace(
      /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{200D}]/gu,
      "",
    );
  }
  t = t.replace(/[\u{1F3FB}-\u{1F3FF}]/gu, "");
  t = t.replace(/[⭐✨🔥💡✅❌⚠🎉🚀📌👉⬅️➡️⬆️⬇️]/g, "");

  // ── 5. 空白收尾 ──
  t = t.replace(/[ \t]+\n/g, "\n");
  t = t.replace(/\n{2,}/g, "。");
  t = t.replace(/\s{2,}/g, " ");
  t = t.replace(/\s+([，。！？；、,:;.!?])/g, "$1");
  t = t.trim();

  return t;
}

type ParsedMdLink = {
  /** 链接显示文字；图片为空串 */
  label: string;
  /** 消费到的下一个下标（已过结尾 `)`） */
  end: number;
};

/**
 * 从 `start`（指向 `[`）解析 `[label](url)`，URL 允许空格、?&=/#、嵌套括号。
 */
function parseMarkdownLinkAt(
  text: string,
  start: number,
): ParsedMdLink | null {
  if (text[start] !== "[") return null;

  const labelEnd = text.indexOf("]", start + 1);
  if (labelEnd < 0) return null;
  if (text[labelEnd + 1] !== "(") return null;

  let depth = 1;
  let j = labelEnd + 2;
  let inQuote: '"' | "'" | null = null;

  while (j < text.length && depth > 0) {
    const ch = text[j]!;
    if (inQuote) {
      if (ch === inQuote) inQuote = null;
      j += 1;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inQuote = ch;
      j += 1;
      continue;
    }
    if (ch === "(") depth += 1;
    else if (ch === ")") depth -= 1;
    j += 1;
  }

  if (depth !== 0) return null;

  const label = text.slice(start + 1, labelEnd);
  return { label, end: j };
}

/**
 * 完整 Markdown 链接解析：
 * - [文本](url) → 文本
 * - [文本]( /relative?x=1 ) → 文本
 * - ![alt](url) → 空（不朗读图片）
 */
function stripMarkdownLinks(text: string): string {
  let out = "";
  let i = 0;

  while (i < text.length) {
    // 图片 ![alt](url) → 删除
    if (text[i] === "!" && text[i + 1] === "[") {
      const parsed = parseMarkdownLinkAt(text, i + 1);
      if (parsed) {
        // 按需求：图片不朗读
        i = parsed.end;
        continue;
      }
    }

    // 普通链接 [text](url) → text
    if (text[i] === "[") {
      const parsed = parseMarkdownLinkAt(text, i);
      if (parsed) {
        out += parsed.label;
        i = parsed.end;
        continue;
      }
    }

    out += text[i];
    i += 1;
  }

  // 引用式 [text][id]
  out = out.replace(/\[([^\]]+)\]\[[^\]]*\]/g, "$1");
  // 定义行 [id]: url
  out = out.replace(/^\s*\[[^\]]+\]:\s*\S+.*$/gm, " ");
  // 自动链接 <https://...>
  out = out.replace(/<https?:\/\/[^>]+>/gi, " ");
  out = out.replace(/<www\.[^>]+>/gi, " ");

  return out;
}

/**
 * 删除裸链接与链接残留片段（pay/xxx、?id=xxx、/order/...）
 */
function stripBareUrls(text: string): string {
  let t = text;

  // 完整 URL
  t = t.replace(/\bhttps?:\/\/[^\s)\]>，。！？；、"'<>]+/gi, " ");
  t = t.replace(/\bwww\.[^\s)\]>，。！？；、"'<>]+/gi, " ");

  // 查询串残留：?id=123&x=1
  t = t.replace(/\?[A-Za-z0-9_.=&%\-]+/g, " ");

  // 常见相对路径 / 业务路径残留
  t = t.replace(
    /(?:^|[\s，。！？；、:：])\/?(?:payment|pay|order|orders|api|checkout|recharge|buy|purchase)\/[A-Za-z0-9_\-./%?]*/gi,
    " ",
  );

  // 形如 pay/xxx 或 order/detail/123（无前导 /）
  t = t.replace(
    /\b(?:payment|pay|order|orders|checkout|recharge)\/[A-Za-z0-9_\-./%?&=]*/gi,
    " ",
  );

  // 空括号
  t = t.replace(/[（(]\s*[)）]/g, " ");
  t = t.replace(/\(\s*\)/g, " ");

  return t;
}
