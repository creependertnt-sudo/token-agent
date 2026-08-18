export type ChatSseProduct = {
  id: string;
  name: string;
  tokenAmount: number;
  price: number;
};

export type ChatSseDone = {
  reply: string;
  conversationId: string;
  messageId: string;
  tokenBalance: number;
  freeChatCount: number;
  intent?: string;
  showProducts: boolean;
  products: ChatSseProduct[];
  conversionId: string | null;
  service: {
    id: string;
    name: string;
    type: string;
    tokenCost: number;
  };
  messageMeta: {
    serviceType: string;
    modelName: string;
    tokenCost: number;
    tokenBalanceAfter: number;
  };
  modelRoute: {
    provider: string | null;
    model: string | null;
    serviceType: string;
    tokenCost: number;
    displayName: string;
    maxTokens: number;
    callLlm: boolean;
    label: string;
    usedFallback: boolean;
  };
  memoryCount: number;
  featureCost: number;
  lockedType: string;
  lockedCost: number;
  serviceType: string;
  selectedServiceType: string;
  usedServiceType: string;
  salesDecision?: unknown;
};

export type ChatSseHandlers = {
  onThinking?: () => void;
  onDelta?: (text: string) => void;
  onDone?: (data: ChatSseDone) => void;
  onError?: (message: string) => void;
};

export function encodeSse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export const SSE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
} as const;

export function createSseResponse(
  run: (emit: (event: string, data: unknown) => void) => Promise<void>,
): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const emit = (event: string, data: unknown) => {
        if (closed) return;
        controller.enqueue(encoder.encode(encodeSse(event, data)));
      };
      try {
        emit("thinking", { active: true });
        await run(emit);
      } catch (error) {
        emit("error", {
          error:
            error instanceof Error ? error.message : "生成失败，请稍后重试。",
        });
      } finally {
        closed = true;
        try {
          controller.close();
        } catch {
          // already closed
        }
      }
    },
  });
  return new Response(stream, { headers: SSE_HEADERS });
}

function parseSseBlock(block: string): { event: string; data: string } | null {
  let event = "message";
  const dataLines: string[] = [];
  for (const rawLine of block.split("\n")) {
    const line = rawLine.replace(/\r$/, "");
    if (!line || line.startsWith(":")) continue;
    if (line.startsWith("event:")) {
      event = line.slice(6).trim();
      continue;
    }
    if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trimStart());
    }
  }
  if (dataLines.length === 0) return null;
  return { event, data: dataLines.join("\n") };
}

export async function consumeChatSse(
  response: Response,
  handlers: ChatSseHandlers,
): Promise<void> {
  if (!response.body) {
    handlers.onError?.("响应为空。");
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finished = false;

  const dispatch = (event: string, raw: string) => {
    let payload: unknown = raw;
    try {
      payload = JSON.parse(raw) as unknown;
    } catch {
      // keep raw string
    }
    if (event === "thinking") {
      handlers.onThinking?.();
      return;
    }
    if (event === "delta") {
      const text =
        typeof payload === "object" &&
        payload !== null &&
        "text" in payload &&
        typeof (payload as { text: unknown }).text === "string"
          ? (payload as { text: string }).text
          : "";
      if (text) handlers.onDelta?.(text);
      return;
    }
    if (event === "done") {
      finished = true;
      handlers.onDone?.(payload as ChatSseDone);
      return;
    }
    if (event === "error") {
      finished = true;
      const message =
        typeof payload === "object" &&
        payload !== null &&
        "error" in payload &&
        typeof (payload as { error: unknown }).error === "string"
          ? (payload as { error: string }).error
          : "生成失败，请稍后重试。";
      handlers.onError?.(message);
    }
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      buffer = buffer.replace(/\r\n/g, "\n");
      let sep = buffer.indexOf("\n\n");
      while (sep >= 0) {
        const block = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        const parsed = parseSseBlock(block);
        if (parsed) dispatch(parsed.event, parsed.data);
        sep = buffer.indexOf("\n\n");
      }
    }
    buffer += decoder.decode();
    if (buffer.trim()) {
      const parsed = parseSseBlock(buffer);
      if (parsed) dispatch(parsed.event, parsed.data);
    }
    if (!finished) {
      handlers.onError?.("连接已中断，请重试。");
    }
  } catch (error) {
    if (!finished) {
      handlers.onError?.(
        error instanceof Error ? error.message : "连接已中断，请重试。",
      );
    }
  }
}
