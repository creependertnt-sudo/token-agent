import { prisma } from "@/lib/db";
import { publicErrorMessage } from "@/lib/error-handler";

export type AgentErrorType =
  | "deepseek"
  | "tool"
  | "database"
  | "sse"
  | "unknown";

async function swallow<T>(work: () => Promise<T>): Promise<T | null> {
  try {
    return await work();
  } catch (error) {
    console.error("[obs:error]", error);
    return null;
  }
}

export function classifyAgentError(error: unknown): AgentErrorType {
  const message = error instanceof Error ? error.message : String(error);
  if (
    /deepseek|openai|api key|401|429|ECONNRESET|fetch failed|insufficient_quota/i.test(
      message,
    )
  ) {
    return "deepseek";
  }
  if (/tool/i.test(message)) return "tool";
  if (/prisma|sqlite|database/i.test(message)) return "database";
  if (/sse|stream|readable/i.test(message)) return "sse";
  return "unknown";
}

export async function recordAgentError(input: {
  type: AgentErrorType | string;
  message: string;
  traceId?: string | null;
}): Promise<{ id: string } | null> {
  return swallow(async () => {
    const row = await prisma.agentErrorLog.create({
      data: {
        type: input.type,
        message: publicErrorMessage(input.message).slice(0, 4000),
        traceId: input.traceId ?? null,
      },
      select: { id: true },
    });
    return row;
  });
}

export async function recordCaughtAgentError(
  error: unknown,
  traceId?: string | null,
  type?: AgentErrorType,
): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  await recordAgentError({
    type: type ?? classifyAgentError(error),
    message,
    traceId,
  });
}
