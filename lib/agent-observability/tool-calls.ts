import { prisma } from "@/lib/db";
import {
  sanitizeToolArguments,
  summarizeToolResult,
} from "@/lib/agent-observability/sanitize";

export async function recordAgentToolCall(input: {
  agentRunId: string;
  toolName: string;
  arguments?: string | Record<string, unknown> | null;
  result?: unknown;
  success: boolean;
  duration: number;
}): Promise<void> {
  try {
    await prisma.agentToolCall.create({
      data: {
        agentRunId: input.agentRunId,
        toolName: input.toolName,
        arguments: sanitizeToolArguments(input.arguments),
        resultSummary: summarizeToolResult(input.toolName, input.result),
        success: input.success,
        duration: Math.max(0, input.duration),
      },
    });
  } catch (error) {
    console.error("[agent-tool-call]", error);
  }
}
