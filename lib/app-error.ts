import { NextResponse } from "next/server";
import { publicErrorMessage, redactLogText } from "@/lib/error-handler";

export type AppErrorCode =
  | "TOKEN_LOW"
  | "MODEL_ERROR"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "BAD_REQUEST"
  | "INTERNAL_ERROR"
  | "HEALTH_ERROR";

export class AppError extends Error {
  code: AppErrorCode | string;
  status: number;

  constructor(code: AppErrorCode | string, message: string, status = 400) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = status;
  }
}

export function errorJson(code: string, message: string, status: number) {
  return NextResponse.json(
    {
      error: {
        code,
        message: redactLogText(message, 240),
      },
    },
    { status },
  );
}

export function errorResponse(error: unknown) {
  if (error instanceof AppError) {
    return errorJson(error.code, error.message, error.status);
  }
  if (
    error &&
    typeof error === "object" &&
    "status" in error &&
    "message" in error
  ) {
    const status = Number((error as { status?: number }).status) || 500;
    const message =
      typeof (error as { message?: unknown }).message === "string"
        ? (error as { message: string }).message
        : "服务暂时不可用";
    const code =
      typeof (error as { code?: unknown }).code === "string"
        ? (error as { code: string }).code
        : status === 401
          ? "UNAUTHORIZED"
          : status === 403
            ? "FORBIDDEN"
            : status === 404
              ? "NOT_FOUND"
              : "INTERNAL_ERROR";
    return errorJson(code, message, status);
  }

  console.error("[app-error]", publicErrorMessage(error));
  return errorJson("INTERNAL_ERROR", "服务暂时不可用", 500);
}
