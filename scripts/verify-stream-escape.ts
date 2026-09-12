/**
 * A 补丁验收：escape / unescape / 未闭合 fence / 安全门控。
 * 运行：npx tsx scripts/verify-stream-escape.ts
 */
import {
  ENABLE_STREAM_ESCAPE,
  appendSafeMarkdownStream,
  escapeDuringStream,
  hasUnclosedFenceOrLink,
  isMarkdownSafe,
  unescapeAfterStream,
} from "../lib/markdown-stream";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const chunks = [
  "这里先说一段：**重要点",
  "，继续说明** 接下来是代码：```js\nconsole.log(",
  "1);\n``` 结束",
];

let display = "";
let pending = "";
for (const chunk of chunks) {
  const next = appendSafeMarkdownStream(display, pending, chunk);
  display = next.displayText;
  pending = next.pendingText;

  // 流式展示层：escape 入库后应能还原
  const stored = escapeDuringStream(display);
  const readable = unescapeAfterStream(stored);
  assert(readable === display, "escape/unescape roundtrip failed on display");

  // 流式阶段不得把「当前可见缓冲」当成可解析 Markdown 前提
  // （完整安全才进入 display；未闭合留在 pending）
  if (display) {
    assert(isMarkdownSafe(display), "displayText must stay markdown-safe");
  }
}

const full = chunks.join("");
assert(hasUnclosedFenceOrLink(chunks[0]!), "chunk1 should be unclosed");
assert(hasUnclosedFenceOrLink(chunks[0]! + chunks[1]!), "chunk1+2 unclosed fence");
assert(!hasUnclosedFenceOrLink(full), "full text should be closed");

const escapedFull = escapeDuringStream(full);
const restored = unescapeAfterStream(escapedFull);
assert(restored === full, "full roundtrip");
assert(
  !escapedFull.includes("```") && escapedFull.includes("§ESC_BCKT§"),
  "escape should neutralize fences",
);

console.log(
  JSON.stringify(
    {
      ok: true,
      ENABLE_STREAM_ESCAPE,
      displayLen: display.length,
      pendingLen: pending.length,
      finalSafe: isMarkdownSafe(full),
    },
    null,
    2,
  ),
);
