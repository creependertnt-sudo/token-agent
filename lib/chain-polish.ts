import { authFetch } from "@/lib/client-auth";

const POLISH_TIMEOUT_MS = 2200;

/**
 * 第4-7：仅对 step2 做一次轻润色（可开关）。
 * 失败 / 超时 → 原文 fallback。
 */
export async function polishChainStep2(
  step2: string,
  enabled = true,
): Promise<string> {
  if (!enabled) return step2;
  const original = step2.trim();
  if (!original) return step2;

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), POLISH_TIMEOUT_MS);

  try {
    const response = await authFetch("/api/starters/rewrite", {
      method: "POST",
      body: JSON.stringify({
        mode: "sentence",
        texts: [original],
      }),
      signal: controller.signal,
    });
    if (!response.ok) return original;

    const data = (await response.json()) as {
      texts?: string[] | null;
      fallback?: boolean;
    };
    if (data.fallback || !data.texts?.[0]?.trim()) return original;

    const polished = data.texts[0].trim();
    // 过短或空泛则丢弃
    if (polished.length < 8 || /点击这里|查看更多/.test(polished)) {
      return original;
    }
    return polished;
  } catch {
    return original;
  } finally {
    window.clearTimeout(timer);
  }
}
