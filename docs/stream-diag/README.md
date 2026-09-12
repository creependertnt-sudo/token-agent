# Stream / Markdown 诊断材料包（token-agent）

生成时间: 2026-09-12
HEAD: 3850fee0b6d23cb3824a34af781ba2b154350fbc
说明: 猜测文件名 → 本仓库真实路径映射 + 契约摘要。

## 1) 路径映射（优先级 1）

| 你要的名字 | 本仓库真实路径 | 说明 |
|---|---|---|
| MessageRenderer.tsx / Message.tsx | **不存在同名**；渲染在 `components/chat/conversion/MessageList.tsx`（`MessageBubbleRow` 内联） | 另有遗留 `components/chat/MessageBubble.tsx`（当前 /chat 主路径未用） |
| MessageList.tsx | `components/chat/conversion/MessageList.tsx` | 列表 + streaming 分支 |
| ChatMarkdown.tsx | `components/chat/conversion/ChatMarkdown.tsx` | 仅 `streaming===false` 时用 |
| lib/stream.ts | **无**；等价拆在：`lib/markdown-stream.ts` + `lib/chat-immersion.ts` + `app/chat/page.tsx` sendMessage 内 | |
| useStream hook | **无独立 hook**；逻辑在 `app/chat/page.tsx` | |
| SSE client | `lib/chat-sse.ts` → `consumeChatSse` | fetch + ReadableStream reader |
| SSE server | `app/api/chat/route.ts` + `createSseResponse` | event: thinking / delta / done / error |
| Message 类型 | `components/chat/types.ts` → `ChatMessage` | **无 streamPlain 字段**；streamPlain 是 CSS class |
| throttle | `lib/chat-immersion.ts` → `createThrottledUpdater` (100ms) | |

## 2) 当前契约（很重要）

### ChatMessage 关键字段
- `content: string` — 唯一正文（流式与完成共用）
- `streaming?: boolean` — true 时 MessageList 用 `.streamPlain` 纯文本，**不**跑 ReactMarkdown
- `thinking?: boolean` — 首 token 前
- **没有** `streamPlain` / `text` 字段（text ≡ content）

### 流式缓冲（page.tsx 闭包局部变量，不在 message 上）
- `streamBuffer` — 原始累计
- `displayText` / `pendingText` — `appendSafeMarkdownStream` 门控结果
- `shownLen` — UI 揭示长度（分段 + 节流）
- `applyDone` — done 后 `streaming:false`，一次性 `ChatMarkdown`

### SSE chunk 格式
`
event: thinking
data: {"active":true}

event: delta
data: {"text":"..."}

event: done
data: { "reply":"全文", "conversationId":"...", "messageMeta":{...}, ... }

event: error
data: {"error":"..."}
`

### 已有“半截 Markdown”处理
`lib/markdown-stream.ts`：
- 奇数 `*` / 奇数 `` ` / 未闭合 `[]()` → 留在 pending，不并入 display
- 流式 UI 仍可能显示 display 中已安全的前缀；完成态用全文

## 3) 最小复现（建议）

见同目录 `sse-repro-sample.txt`。

操作步骤：
1. 打开 /chat，新对话
2. 输入：请用 Markdown 写一段带加粗和代码块的说明
3. 观察流式阶段是否出现裸 `*` / 半截 fence；完成后是否闪一下 Markdown 重排

## 5) A 补丁状态（fix/stream-escape-and-safe-render）

- ``lib/markdown-stream.ts``：``ENABLE_STREAM_ESCAPE`` / ``escapeDuringStream`` / ``unescapeAfterStream`` / ``hasUnclosedFenceOrLink``
- ``MessageList``：``StreamSafeContent`` — streaming 绝不 ``ChatMarkdown``；done 才 unescape + 渲染
- ``page.tsx``：流式 ``content`` 写 escape；``applyDone`` 一次性 unescape
- env：``NEXT_PUBLIC_ENABLE_STREAM_ESCAPE=true``（默认开启）
- 验收：``npx tsx scripts/verify-stream-escape.ts``

## 4) 缺项（需你本地补）
- DevTools Performance trace / 录屏：请录制后放到 ``docs/stream-diag/perf-after-escape-<iso>.json``
