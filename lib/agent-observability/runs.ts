import { prisma } from "@/lib/db";
import { publicErrorMessage } from "@/lib/error-handler";

export async function startAgentRun(input: {
  userId: string;
  serviceType: string;
  modelType?: string | null;
  intent?: string | null;
  memoryInjectedCount?: number | null;
  memoryCategory?: string | null;
  requestId?: string | null;
}): Promise<{ id: string; startedAt: number } | null> {
  try {
    const row = await prisma.agentRun.create({
      data: {
        userId: input.userId,
        serviceType: input.serviceType,
        modelType: input.modelType ?? null,
        intent: input.intent ?? null,
        success: false,
        memoryInjectedCount: input.memoryInjectedCount ?? null,
        memoryCategory: input.memoryCategory ?? null,
        requestId: input.requestId ?? null,
      },
      select: { id: true },
    });
    console.log(
      `[agent-run] requestId=${input.requestId ?? "-"} id=${row.id} type=${input.serviceType}`,
    );
    return { id: row.id, startedAt: Date.now() };
  } catch (error) {
    console.error("[agent-run]", error);
    return null;
  }
}

export async function finishAgentRun(
  runId: string | null | undefined,
  input: {
    success: boolean;
    error?: unknown;
    intent?: string | null;
    modelType?: string | null;
    toolsUsed?: string[];
    duration?: number;
    toolDuration?: number;
    llmDuration?: number;
    memoryUsedCount?: number | null;
    memoryCategory?: string | null;
  },
): Promise<void> {
  if (!runId) return;
  try {
    await prisma.agentRun.update({
      where: { id: runId },
      data: {
        success: input.success,
        errorMessage: input.success
          ? null
          : publicErrorMessage(input.error ?? "unknown"),
        intent: input.intent ?? undefined,
        modelType: input.modelType ?? undefined,
        toolsUsed: input.toolsUsed?.length ? input.toolsUsed.join(",") : null,
        toolCount: input.toolsUsed?.length ?? 0,
        duration: input.duration ?? null,
        toolDuration: input.toolDuration ?? null,
        llmDuration: input.llmDuration ?? null,
        memoryUsedCount: input.memoryUsedCount ?? undefined,
      },
    });
  } catch (error) {
    console.error("[agent-run]", error);
  }
}
