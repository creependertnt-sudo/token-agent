import { authFetch } from "@/lib/client-auth";
import {
  isForbiddenStarterCopy,
  normalizeStarterActionText,
  type StarterBundle,
  type StarterQuickSend,
} from "@/lib/quick-send";

const ENHANCE_TIMEOUT_MS = 2800;
const MAX_REWRITE = 2;

type RewriteResponse = {
  texts?: string[] | null;
  fallback?: boolean;
};

function withLabel(item: StarterQuickSend, label: string): StarterQuickSend {
  const next = normalizeStarterActionText(label);
  if (!next || isForbiddenStarterCopy(next)) return item;
  return {
    ...item,
    label: next,
    prompt: next,
  };
}

/**
 * 轻量 AI 改写 Starter 文案（最多 1~2 条）。
 * 失败 / 超时 → 原样返回，不阻塞空态。
 */
export async function enhanceStarterBundle(
  bundle: StarterBundle,
): Promise<StarterBundle> {
  const targets: StarterQuickSend[] = [bundle.primary];
  if (bundle.secondary[0]) targets.push(bundle.secondary[0]);
  const slice = targets.slice(0, MAX_REWRITE);
  if (slice.length === 0) return bundle;

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), ENHANCE_TIMEOUT_MS);

  try {
    const response = await authFetch("/api/starters/rewrite", {
      method: "POST",
      body: JSON.stringify({
        texts: slice.map((item) => item.prompt || item.label),
      }),
      signal: controller.signal,
    });

    if (!response.ok) return bundle;

    const data = (await response.json()) as RewriteResponse;
    if (data.fallback || !Array.isArray(data.texts) || data.texts.length === 0) {
      return bundle;
    }

    const [primaryText, secondaryText] = data.texts;
    let next: StarterBundle = {
      ...bundle,
      primary: primaryText
        ? withLabel(bundle.primary, primaryText)
        : bundle.primary,
      secondary: [...bundle.secondary],
    };

    if (secondaryText && next.secondary[0]) {
      next = {
        ...next,
        secondary: [
          withLabel(next.secondary[0], secondaryText),
          ...next.secondary.slice(1),
        ],
      };
    }

    return next;
  } catch {
    return bundle;
  } finally {
    window.clearTimeout(timer);
  }
}
