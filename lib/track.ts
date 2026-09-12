/**
 * 聊天页行为埋点（轻量）。
 * 客户端 console + fire-and-forget POST /api/track。
 */

export type TrackEventName =
  | "switch_model"
  | "send_message"
  | "click_package"
  | "click_buy"
  | "buy_success";

export type TrackPayload = Record<string, unknown>;

export function track(event: TrackEventName, data: TrackPayload = {}) {
  const payload = { event, data, ts: Date.now() };
  // 开发/生产都打日志，方便直接在浏览器 Network / Console 看路径
  console.log("[track]", event, data);

  try {
    void fetch("/api/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => {
      // 埋点失败不影响主流程
    });
  } catch {
    // ignore
  }
}
