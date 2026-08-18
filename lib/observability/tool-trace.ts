export type ToolTraceHandle = {
  traceId: string;
  userId: string;
  toolName: string;
  arguments?: string | null;
  startedAt: number;
};

export function createToolTrace(input: {
  traceId: string;
  userId: string;
  toolName: string;
  arguments?: string | Record<string, unknown> | null;
}): ToolTraceHandle {
  const raw = input.arguments;
  const serialized =
    raw == null
      ? null
      : typeof raw === "string"
        ? raw.slice(0, 2000)
        : JSON.stringify(raw).slice(0, 2000);
  return {
    traceId: input.traceId,
    userId: input.userId,
    toolName: input.toolName,
    arguments: serialized,
    startedAt: Date.now(),
  };
}

export async function finishToolTrace(
  handle: ToolTraceHandle | null | undefined,
  _input: { success: boolean; error?: string | null },
): Promise<void> {
  if (!handle) return;
  // ToolCallLog 由 runToolCall 统一写入，这里不再重复 create。
}
