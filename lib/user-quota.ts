import { prisma } from "@/lib/db";
import { OrderStatus } from "@/app/generated/prisma/enums";

export type UserQuotaTier = "NORMAL" | "PREMIUM" | "ENTERPRISE";

export type UserQuota = {
  tier: UserQuotaTier;
  requestsPerMinute: number;
  maxMemories: number;
  memoryPromptLimit: number;
  contextRounds: number;
};

/** 上下文硬限制：最近 20 轮（一轮 ≈ 用户+助手） */
export const CONTEXT_HISTORY_ROUNDS = 20;

const QUOTA: Record<UserQuotaTier, Omit<UserQuota, "tier">> = {
  NORMAL: {
    requestsPerMinute: 10,
    maxMemories: 100,
    memoryPromptLimit: 20,
    contextRounds: CONTEXT_HISTORY_ROUNDS,
  },
  PREMIUM: {
    requestsPerMinute: 100,
    maxMemories: 300,
    memoryPromptLimit: 24,
    contextRounds: CONTEXT_HISTORY_ROUNDS,
  },
  ENTERPRISE: {
    requestsPerMinute: 300,
    maxMemories: 500,
    memoryPromptLimit: 30,
    contextRounds: CONTEXT_HISTORY_ROUNDS,
  },
};

/**
 * 用已有订单判断配额档，不新增用户字段、不改扣费。
 * 无成交=普通；有成交=高级；大额/多次=企业。
 */
export async function resolveUserQuota(userId: string): Promise<UserQuota> {
  const orders = await prisma.order.findMany({
    where: { userId, status: OrderStatus.SUCCESS },
    select: { tokenAmount: true, package: { select: { name: true } } },
    take: 20,
    orderBy: { createdAt: "desc" },
  });

  let tier: UserQuotaTier = "NORMAL";
  if (orders.length >= 3) {
    tier = "ENTERPRISE";
  } else if (
    orders.some(
      (o) =>
        o.tokenAmount >= 80_000 || /企业|高级|enterprise/i.test(o.package?.name ?? ""),
    )
  ) {
    tier = "ENTERPRISE";
  } else if (orders.length > 0) {
    tier = "PREMIUM";
  }

  return { tier, ...QUOTA[tier] };
}
