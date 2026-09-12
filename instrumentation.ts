export async function register() {
  // 仅在 Node.js 运行时检查；Edge 不加载豆包语音服务端逻辑
  if (process.env.NEXT_RUNTIME === "edge") return;

  const { warnIfVolcApiKeyMissing } = await import("@/lib/volc-speech");
  warnIfVolcApiKeyMissing();
}
