import type OpenAI from "openai";
import { toOpenAITools } from "@/lib/tool-registry";
import { runToolCall, type ToolCallRequest, type ToolCallResult } from "@/lib/tool-runner";
import type { ToolContext } from "@/lib/tools/types";
import {
  TOOL_QUERY_MODE_GUIDE,
} from "@/lib/tool-query-mode";
import { createToolTrace, finishToolTrace } from "@/lib/observability/tool-trace";
import { recordAgentError } from "@/lib/observability/error-trace";
import { recordAgentToolCall } from "@/lib/agent-observability/tool-calls";
import { prisma } from "@/lib/db";

const MAX_TOOL_ROUNDS = 3;

type ChatMessage = OpenAI.Chat.ChatCompletionMessageParam;

type StreamDelta = {
  content?: string | null;
  reasoning_content?: string | null;
  tool_calls?: Array<{
    index?: number;
    id?: string;
    type?: string;
    function?: { name?: string; arguments?: string };
  }>;
};

export type AgentRuntimeInput = {
  client: OpenAI;
  model: string;
  messages: ChatMessage[];
  maxTokens: number;
  temperature: number;
  thinkingEnabled: boolean;
  ctx: ToolContext;
  onDelta: (text: string) => void;
  /** 纯查询：完整展示 Tool 结果，禁止销售推荐覆盖正文 */
  toolQueryMode?: boolean;
  /** 观测轨迹 ID；缺省则不写 ToolCallLog */
  traceId?: string | null;
  /** 第七阶段 AgentRun；缺省则不写 AgentToolCall */
  agentRunId?: string | null;
};

export type AgentRuntimeResult = {
  content: string;
  toolNames: string[];
  toolQueryMode: boolean;
  llmDuration: number;
  toolDuration: number;
};

function applyToolCallDelta(
  acc: ToolCallRequest[],
  delta: NonNullable<StreamDelta["tool_calls"]>[number],
) {
  const index = delta.index ?? acc.length;
  const current = acc[index] ?? { id: "", name: "", arguments: "" };
  if (delta.id) current.id = delta.id;
  if (delta.function?.name) {
    current.name = `${current.name ?? ""}${delta.function.name}`;
  }
  if (delta.function?.arguments) {
    current.arguments = `${typeof current.arguments === "string" ? current.arguments : ""}${delta.function.arguments}`;
  }
  acc[index] = current;
}

async function streamOnce(input: {
  client: OpenAI;
  model: string;
  messages: ChatMessage[];
  maxTokens: number;
  temperature: number;
  thinkingEnabled: boolean;
  toolsEnabled: boolean;
  emit: boolean;
  onDelta: (text: string) => void;
}): Promise<{ content: string; toolCalls: ToolCallRequest[] }> {
  const completion = await input.client.chat.completions.create({
    model: input.model,
    messages: input.messages,
    max_tokens: input.maxTokens,
    temperature: input.temperature,
    stream: true,
    ...(input.toolsEnabled ? { tools: toOpenAITools(), tool_choice: "auto" } : {}),
    thinking: { type: input.thinkingEnabled ? "enabled" : "disabled" },
  } as Parameters<typeof input.client.chat.completions.create>[0]);

  let content = "";
  const toolCalls: ToolCallRequest[] = [];
  let sawTool = false;

  for await (const chunk of completion as AsyncIterable<{
    choices?: Array<{ delta?: StreamDelta }>;
  }>) {
    const delta = chunk.choices?.[0]?.delta;
    if (!delta) continue;

    if (delta.tool_calls && delta.tool_calls.length > 0) {
      sawTool = true;
      for (const tc of delta.tool_calls) {
        applyToolCallDelta(toolCalls, tc);
      }
    }

    const piece = delta.content ?? "";
    if (!piece || sawTool) continue;
    content += piece;
    if (input.emit) input.onDelta(piece);
  }

  return {
    content,
    toolCalls: toolCalls.filter((c) => Boolean(c.name)),
  };
}

async function writeToolResultToAgentLog(
  userId: string,
  toolResult: { toolName: string; success: boolean },
) {
  try {
    const latest = await prisma.agentLog.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: { id: true, toolUsed: true, toolSuccess: true },
    });
    if (!latest) return;

    const toolUsed = latest.toolUsed
      ? `${latest.toolUsed},${toolResult.toolName}`
      : toolResult.toolName;
    const toolSuccess =
      latest.toolSuccess === false ? false : toolResult.success;

    await prisma.agentLog.update({
      where: { id: latest.id },
      data: {
        toolUsed,
        toolSuccess,
      },
    });
  } catch (error) {
    console.error("[agent-log]", error);
  }
}

/**
 * Agent Runtime：LLM 判断是否需要 Tool → 执行 → 再生成回答。
 * 不替代 sales-pipeline；只负责实时查数。
 */
export async function runAgentRuntime(
  input: AgentRuntimeInput,
): Promise<AgentRuntimeResult> {
  const toolQueryMode = Boolean(input.toolQueryMode);
  const messages: ChatMessage[] = [...input.messages];
  const toolNames: string[] = [];
  let llmDuration = 0;
  let toolDuration = 0;

  if (toolQueryMode) {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const current = messages[i];
      if (current?.role === "system" && typeof current.content === "string") {
        messages[i] = {
          ...current,
          content: `${current.content}\n\n${TOOL_QUERY_MODE_GUIDE}`,
        };
        break;
      }
    }
  }

  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    const forceAnswer = round === MAX_TOOL_ROUNDS - 1;
    const llmStarted = Date.now();
    const step = await streamOnce({
      client: input.client,
      model: input.model,
      messages,
      maxTokens: input.maxTokens,
      temperature: input.temperature,
      thinkingEnabled: input.thinkingEnabled,
      toolsEnabled: !forceAnswer,
      emit: true,
      onDelta: input.onDelta,
    });
    llmDuration += Date.now() - llmStarted;

    if (step.toolCalls.length === 0) {
      return { content: step.content, toolNames, toolQueryMode, llmDuration, toolDuration };
    }

    const namedCalls = step.toolCalls.map((call, i) => ({
      ...call,
      id: call.id?.trim() || `call_${call.name}_${round}_${i}`,
    }));
    const executed: ToolCallResult[] = [];
    for (const call of namedCalls) {
      const handle = input.traceId
        ? createToolTrace({
            traceId: input.traceId,
            userId: input.ctx.userId,
            toolName: call.name,
            arguments: call.arguments,
          })
        : null;
      const toolStarted = Date.now();
      const item = await runToolCall(call, input.ctx);
      const toolMs = Date.now() - toolStarted;
      toolDuration += toolMs;
      const toolResult = {
        toolName: item.name,
        success: item.ok,
      };
      toolNames.push(item.name);
      executed.push(item);
      await writeToolResultToAgentLog(input.ctx.userId, toolResult);
      if (input.agentRunId) {
        await recordAgentToolCall({
          agentRunId: input.agentRunId,
          toolName: item.name,
          arguments: call.arguments,
          result: item.result,
          success: item.ok,
          duration: toolMs,
        });
      }
      await finishToolTrace(handle, {
        success: item.ok,
        error: item.ok
          ? null
          : typeof item.result === "object" &&
              item.result &&
              "message" in item.result
            ? String((item.result as { message?: unknown }).message ?? "tool_failed")
            : "tool_failed",
      });
      if (!item.ok && input.traceId) {
        await recordAgentError({
          type: "tool",
          message: `${item.name} failed`,
          traceId: input.traceId,
        });
      }
    }

    messages.push({
      role: "assistant",
      content: step.content || null,
      tool_calls: executed.map((item, i) => ({
        id: item.id || `call_${item.name}_${i}`,
        type: "function" as const,
        function: {
          name: item.name,
          arguments:
            typeof namedCalls[i]?.arguments === "string"
              ? namedCalls[i].arguments
              : JSON.stringify(namedCalls[i]?.arguments ?? {}),
        },
      })),
    });

    for (const item of executed) {
      messages.push({
        role: "tool",
        tool_call_id: item.id,
        content: JSON.stringify(item.result),
      });
    }
  }

  const fallbackStarted = Date.now();
  const fallback = await streamOnce({
    client: input.client,
    model: input.model,
    messages,
    maxTokens: input.maxTokens,
    temperature: input.temperature,
    thinkingEnabled: input.thinkingEnabled,
    toolsEnabled: false,
    emit: true,
    onDelta: input.onDelta,
  });
  llmDuration += Date.now() - fallbackStarted;

  return { content: fallback.content, toolNames, toolQueryMode, llmDuration, toolDuration };
}
