import { redactLogText } from "@/lib/error-handler";

const DROP_KEYS = new Set([
  "userid",
  "user_id",
  "password",
  "passwordhash",
  "apikey",
  "api_key",
  "authorization",
  "token",
  "secret",
  "cookie",
]);

export function sanitizeToolArguments(
  raw: string | Record<string, unknown> | null | undefined,
): string | null {
  if (raw == null) return null;
  let value: unknown = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      return redactLogText(raw, 200);
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return redactLogText(JSON.stringify(value), 200);
  }
  const next: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (DROP_KEYS.has(key.toLowerCase())) continue;
    next[key] = item;
  }
  return redactLogText(JSON.stringify(next), 200);
}

export function summarizeToolResult(
  toolName: string,
  result: unknown,
): string {
  if (!result || typeof result !== "object") {
    return redactLogText(String(result ?? ""), 160);
  }
  const rec = result as Record<string, unknown>;
  if (toolName === "query_balance" && typeof rec.tokenBalance === "number") {
    return `${rec.tokenBalance} Token`;
  }
  if (toolName === "query_packages" && Array.isArray(rec.packages)) {
    return `${rec.packages.length} packages`;
  }
  if (toolName === "query_orders" && Array.isArray(rec.orders)) {
    return `${rec.orders.length} orders`;
  }
  if (toolName === "query_memory") {
    const n = Array.isArray(rec.agentMemories) ? rec.agentMemories.length : 0;
    return `memories=${n}`;
  }
  if (typeof rec.error === "string") {
    return redactLogText(`error:${rec.error}`, 160);
  }
  return redactLogText(JSON.stringify(rec), 160);
}
