import { prisma } from "@/lib/db";
import {
  FEATURE_TOKEN_COST,
  type PremiumFeature,
} from "@/lib/constants";
import { NextResponse } from "next/server";

export const TOKEN_NOT_ENOUGH = "TOKEN_NOT_ENOUGH";

export const TOKEN_TX_PENDING = "PENDING";
export const TOKEN_TX_SUCCESS = "SUCCESS";
export const TOKEN_TX_FAILED = "FAILED";

export class TokenNotEnoughError extends Error {
  code = TOKEN_NOT_ENOUGH;
  required: number;
  balance: number;

  constructor(required = 0, balance = 0, message = "AI服务额度不足，请购买Token套餐") {
    super(message);
    this.name = "TokenNotEnoughError";
    this.required = required;
    this.balance = balance;
  }
}

export type TokenTxHold = {
  id: string;
  amount: number;
  tokenBalance: number;
  freeChatCount: number;
};

const userBalanceSelect = {
  id: true,
  email: true,
  tokenBalance: true,
  freeChatCount: true,
} as const;

/**
 * 付费预扣：余额检查 + 扣减 + PENDING 记录。
 * amount 必须 > 0；SALES 禁止调用。
 */
export async function beginTokenTransaction(input: {
  userId: string;
  amount: number;
  reason: string;
  serviceId?: string | null;
}): Promise<TokenTxHold> {
  const { userId, amount, reason, serviceId } = input;
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("amount must be a positive number");
  }

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { tokenBalance: true },
    });

    if (!user || user.tokenBalance < amount) {
      throw new TokenNotEnoughError(amount, user?.tokenBalance ?? 0);
    }

    const updated = await tx.user.update({
      where: { id: userId },
      data: { tokenBalance: { decrement: amount } },
      select: userBalanceSelect,
    });

    const row = await tx.tokenTransaction.create({
      data: {
        userId,
        serviceId: serviceId ?? null,
        amount,
        status: TOKEN_TX_PENDING,
        reason,
      },
      select: { id: true },
    });

    return {
      id: row.id,
      amount,
      tokenBalance: updated.tokenBalance,
      freeChatCount: updated.freeChatCount,
    };
  });
}

/**
 * AI 成功：PENDING → SUCCESS，并写入 TokenUsage（有 serviceId 时）。
 * 已 SUCCESS 则幂等返回；已 FAILED 不改状态。
 */
export async function confirmTokenTransaction(
  transactionId: string,
  options?: { serviceId?: string | null; reason?: string },
): Promise<TokenTxHold> {
  return prisma.$transaction(async (tx) => {
    const row = await tx.tokenTransaction.findUnique({
      where: { id: transactionId },
    });
    if (!row) {
      throw new Error("TokenTransaction 不存在。");
    }

    const user = await tx.user.findUnique({
      where: { id: row.userId },
      select: userBalanceSelect,
    });
    if (!user) {
      throw new Error("用户不存在。");
    }

    if (row.status === TOKEN_TX_SUCCESS) {
      return {
        id: row.id,
        amount: row.amount,
        tokenBalance: user.tokenBalance,
        freeChatCount: user.freeChatCount,
      };
    }
    if (row.status !== TOKEN_TX_PENDING) {
      return {
        id: row.id,
        amount: row.amount,
        tokenBalance: user.tokenBalance,
        freeChatCount: user.freeChatCount,
      };
    }

    await tx.tokenTransaction.update({
      where: { id: row.id },
      data: { status: TOKEN_TX_SUCCESS },
    });

    const serviceId = options?.serviceId ?? row.serviceId;
    if (serviceId) {
      await tx.tokenUsage.create({
        data: {
          userId: row.userId,
          serviceId,
          amount: -row.amount,
          reason: options?.reason ?? row.reason,
        },
      });
    }

    return {
      id: row.id,
      amount: row.amount,
      tokenBalance: user.tokenBalance,
      freeChatCount: user.freeChatCount,
    };
  });
}

/**
 * AI 失败：PENDING → FAILED，退回额度。
 * 已 FAILED 幂等；已 SUCCESS 不退款。
 */
export async function failTokenTransaction(
  transactionId: string,
): Promise<TokenTxHold> {
  return prisma.$transaction(async (tx) => {
    const row = await tx.tokenTransaction.findUnique({
      where: { id: transactionId },
    });
    if (!row) {
      throw new Error("TokenTransaction 不存在。");
    }

    if (row.status === TOKEN_TX_PENDING) {
      await tx.tokenTransaction.update({
        where: { id: row.id },
        data: { status: TOKEN_TX_FAILED },
      });
      const updated = await tx.user.update({
        where: { id: row.userId },
        data: { tokenBalance: { increment: row.amount } },
        select: userBalanceSelect,
      });
      return {
        id: row.id,
        amount: row.amount,
        tokenBalance: updated.tokenBalance,
        freeChatCount: updated.freeChatCount,
      };
    }

    const user = await tx.user.findUnique({
      where: { id: row.userId },
      select: userBalanceSelect,
    });
    if (!user) {
      throw new Error("用户不存在。");
    }
    return {
      id: row.id,
      amount: row.amount,
      tokenBalance: user.tokenBalance,
      freeChatCount: user.freeChatCount,
    };
  });
}

/**
 * 立即扣费（兼容旧调用）。内部仍走 PENDING→SUCCESS。
 */
export async function consumeUserToken(userId: string, amount: number) {
  const hold = await beginTokenTransaction({
    userId,
    amount,
    reason: "consume",
  });
  return confirmTokenTransaction(hold.id);
}

/** 按高级功能类型扣费 */
export async function consumeFeatureToken(
  userId: string,
  feature: PremiumFeature,
) {
  return consumeUserToken(userId, FEATURE_TOKEN_COST[feature]);
}

export function tokenNotEnoughResponse(
  error?: TokenNotEnoughError,
  extras?: {
    showProducts?: boolean;
    products?: Array<{
      id: string;
      name: string;
      tokenAmount: number;
      price: number;
    }>;
  },
) {
  return NextResponse.json(
    {
      error: TOKEN_NOT_ENOUGH,
      message: error?.message ?? "AI服务额度不足，请购买Token套餐",
      required: error?.required,
      balance: error?.balance,
      ...(extras?.products && extras.products.length > 0
        ? {
            showProducts: true,
            products: extras.products,
          }
        : extras),
    },
    { status: 402 },
  );
}

/** 充值成功后增加 AI 服务额度 */
export async function creditUserToken(userId: string, amount: number) {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("amount must be a positive number");
  }

  return prisma.user.update({
    where: { id: userId },
    data: { tokenBalance: { increment: amount } },
    select: userBalanceSelect,
  });
}

/** 可选：统计免费咨询次数（不阻断聊天） */
export async function decrementFreeChatCount(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: userBalanceSelect,
  });
  if (!user || user.freeChatCount <= 0) return user;

  return prisma.user.update({
    where: { id: userId },
    data: { freeChatCount: { decrement: 1 } },
    select: userBalanceSelect,
  });
}
