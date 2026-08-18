export type PublicErrorCode =
  | "MODEL_ERROR"
  | "TOOL_ERROR"
  | "DATABASE_ERROR"
  | "SSE_ERROR"
  | "TOKEN_ERROR"
  | "UNKNOWN_ERROR";

export type PublicErrorPayload = {
  success: false;
  code: PublicErrorCode;
  message: string;
};

const SECRET_RE =
  /sk-[a-zA-Z0-9_-]+|api[_-]?key|password|authorization:\s*\S+|bearer\s+\S+/gi;

function stripSecrets(text: string): string {
  return text.replace(SECRET_RE, "[redacted]");
}

export function toPublicError(error: unknown): PublicErrorPayload {
  const raw = error instanceof Error ? error.message : String(error);
  const lower = raw.toLowerCase();

  if (
    /tokennotenough|额度不足|token not enough|TOKEN_NOT_ENOUGH/i.test(raw)
  ) {
    return {
      success: false,
      code: "TOKEN_ERROR",
      message: "AI服务额度不足，请购买Token套餐",
    };
  }
  if (
    /deepseek|openai|api key|401|429|econnreset|fetch failed|model/i.test(
      lower,
    )
  ) {
    return {
      success: false,
      code: "MODEL_ERROR",
      message: "AI服务暂时不可用",
    };
  }
  if (/tool/i.test(lower)) {
    return {
      success: false,
      code: "TOOL_ERROR",
      message: "工具调用失败，请稍后重试",
    };
  }
  if (/prisma|sqlite|database|unique constraint|foreign key/i.test(lower)) {
    return {
      success: false,
      code: "DATABASE_ERROR",
      message: "服务暂时不可用，请稍后重试",
    };
  }
  if (/sse|stream|readable|aborted/i.test(lower)) {
    return {
      success: false,
      code: "SSE_ERROR",
      message: "连接已中断，请重试",
    };
  }

  return {
    success: false,
    code: "UNKNOWN_ERROR",
    message: "服务暂时不可用，请稍后重试",
  };
}

export function publicErrorMessage(error: unknown): string {
  return toPublicError(error).message;
}

export function redactLogText(value: string, max = 240): string {
  return stripSecrets(value).replace(/\s+/g, " ").trim().slice(0, max);
}
