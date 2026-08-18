import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";
import type { UserQuota } from "@/lib/user-quota";

export const RATE_LIMITED = "RATE_LIMITED";

export class RateLimitError extends Error {
  code = RATE_LIMITED;
  retryAfter: number;
  limit: number;
  tier: string;

  constructor(limit: number, tier: string, retryAfter = 60) {
    super("请求过于频繁，请稍后再试。");
    this.name = "RateLimitError";
    this.limit = limit;
    this.tier = tier;
    this.retryAfter = retryAfter;
  }
}

function currentMinute(): number {
  return Math.floor(Date.now() / 60_000);
}

/**
 * 用户级滑动分钟窗口。超限抛 RateLimitError。
 * SALES 同样计入（防无限聊天），但不扣 Token。
 */
export async function assertUserRateLimit(
  userId: string,
  quota: UserQuota,
): Promise<void> {
  const windowStart = currentMinute();
  const staleBefore = windowStart - 2;

  await prisma.rateLimitWindow.deleteMany({
    where: { userId, windowStart: { lt: staleBefore } },
  });

  const row = await prisma.rateLimitWindow.upsert({
    where: {
      userId_windowStart: { userId, windowStart },
    },
    create: { userId, windowStart, count: 1 },
    update: { count: { increment: 1 } },
    select: { count: true },
  });

  if (row.count > quota.requestsPerMinute) {
    throw new RateLimitError(quota.requestsPerMinute, quota.tier);
  }
}

export function rateLimitResponse(error: RateLimitError) {
  return NextResponse.json(
    {
      error: RATE_LIMITED,
      message: error.message,
      retryAfter: error.retryAfter,
      limit: error.limit,
      tier: error.tier,
    },
    {
      status: 429,
      headers: { "Retry-After": String(error.retryAfter) },
    },
  );
}
