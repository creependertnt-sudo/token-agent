import { prisma } from "@/lib/db";

export type AgentTraceStatus = "PENDING" | "SUCCESS" | "FAILED";

async function swallow<T>(work: () => Promise<T>): Promise<T | null> {
  try {
    return await work();
  } catch (error) {
    console.error("[obs:agent]", error);
    return null;
  }
}

export async function createAgentTrace(input: {
  userId?: string | null;
  conversationId?: string | null;
  serviceType: string;
  intent?: string | null;
  model?: string | null;
}): Promise<{ id: string; startedAt: number } | null> {
  return swallow(async () => {
    const row = await prisma.agentTrace.create({
      data: {
        userId: input.userId ?? null,
        conversationId: input.conversationId ?? null,
        serviceType: input.serviceType,
        intent: input.intent ?? null,
        model: input.model ?? null,
        status: "PENDING",
      },
      select: { id: true },
    });
    return { id: row.id, startedAt: Date.now() };
  });
}

export async function finishAgentTrace(
  traceId: string | null | undefined,
  input: {
    status: AgentTraceStatus;
    latency?: number;
    model?: string | null;
    intent?: string | null;
    conversationId?: string | null;
    inputTokens?: number | null;
    outputTokens?: number | null;
  },
): Promise<void> {
  if (!traceId) return;
  await swallow(async () => {
    await prisma.agentTrace.update({
      where: { id: traceId },
      data: {
        status: input.status,
        latency: input.latency ?? null,
        ...(input.model !== undefined ? { model: input.model } : {}),
        ...(input.intent !== undefined ? { intent: input.intent } : {}),
        ...(input.conversationId !== undefined
          ? { conversationId: input.conversationId }
          : {}),
        ...(input.inputTokens !== undefined
          ? { inputTokens: input.inputTokens }
          : {}),
        ...(input.outputTokens !== undefined
          ? { outputTokens: input.outputTokens }
          : {}),
      },
    });
  });
}

export async function getObservabilityStats() {
  const [requests, toolGroups, shown, clicked, paid, errors] = await Promise.all([
    prisma.agentTrace.count(),
    prisma.toolCallLog.groupBy({
      by: ["toolName"],
      _count: { _all: true },
    }),
    prisma.salesFunnelLog.count({ where: { shown: true } }),
    prisma.salesFunnelLog.count({ where: { clicked: true } }),
    prisma.salesFunnelLog.count({ where: { paid: true } }),
    prisma.agentErrorLog.count(),
  ]);

  const tools: Record<string, number> = {};
  for (const row of toolGroups) {
    tools[row.toolName] = row._count._all;
  }

  return {
    requests,
    tools,
    sales: { shown, clicked, paid },
    errors,
  };
}
