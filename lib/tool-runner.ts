import { agentToolMap } from "@/lib/tool-registry";
import type { ToolContext } from "@/lib/tools/types";
import { prisma } from "@/lib/db";

export type ToolCallRequest = {
  id?: string;
  name: string;
  arguments?: string | Record<string, unknown>;
};

export type ToolCallResult = {
  id: string;
  name: string;
  ok: boolean;
  result: unknown;
};

function parseArguments(
  raw: string | Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!raw) return {};
  if (typeof raw === "object") return raw;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return {};
  } catch {
    return {};
  }
}

async function recordToolCallLog(input: {
  userId: string;
  toolName: string;
  success: boolean;
}): Promise<void> {
  try {
    await prisma.toolCallLog.create({
      data: {
        userId: input.userId,
        toolName: input.toolName,
        success: input.success,
      },
    });
  } catch (error) {
    console.error("[tool-log]", error);
  }
}

export async function runToolCall(
  call: ToolCallRequest,
  ctx: ToolContext,
): Promise<ToolCallResult> {
  const id = call.id?.trim() || `call_${call.name}`;
  const name = call.name?.trim() || "";
  const userId = ctx.userId;
  const tool = agentToolMap.get(name);
  if (!tool) {
    await recordToolCallLog({ userId, toolName: name, success: false });
    return {
      id,
      name,
      ok: false,
      result: { error: "unknown_tool", name },
    };
  }

  try {
    const args = parseArguments(call.arguments);
    const result = await tool.execute(args, ctx);
    await recordToolCallLog({ userId, toolName: name, success: true });
    return { id, name, ok: true, result };
  } catch (error) {
    await recordToolCallLog({ userId, toolName: name, success: false });
    return {
      id,
      name,
      ok: false,
      result: {
        error: "tool_failed",
        message: error instanceof Error ? error.message : "tool_failed",
      },
    };
  }
}

export async function runToolCalls(
  calls: ToolCallRequest[],
  ctx: ToolContext,
): Promise<ToolCallResult[]> {
  const results: ToolCallResult[] = [];
  for (const call of calls) {
    results.push(await runToolCall(call, ctx));
  }
  return results;
}
