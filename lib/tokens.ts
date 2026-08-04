import { prisma } from "@/lib/db";
import {
  FEATURE_TOKEN_COST,
  type PremiumFeature,
} from "@/lib/constants";
import { NextResponse } from "next/server";

export const TOKEN_NOT_ENOUGH = "TOKEN_NOT_ENOUGH";

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

/**
 * 扣除用户 AI 服务额度（高级功能使用）。
 * 普通客服聊天请勿调用此方法。
 */
export async function consumeUserToken(userId: string, amount: number) {
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

    return tx.user.update({
      where: { id: userId },
      data: { tokenBalance: { decrement: amount } },
      select: {
        id: true,
        email: true,
        tokenBalance: true,
        freeChatCount: true,
      },
    });
  });
}

/** 按高级功能类型扣费 */
export async function consumeFeatureToken(
  userId: string,
  feature: PremiumFeature,
) {
  return consumeUserToken(userId, FEATURE_TOKEN_COST[feature]);
}

export function tokenNotEnoughResponse(error?: TokenNotEnoughError) {
  return NextResponse.json(
    {
      error: TOKEN_NOT_ENOUGH,
      message: error?.message ?? "AI服务额度不足，请购买Token套餐",
      required: error?.required,
      balance: error?.balance,
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
    select: {
      id: true,
      email: true,
      tokenBalance: true,
      freeChatCount: true,
    },
  });
}

/** 可选：统计免费咨询次数（不阻断聊天） */
export async function decrementFreeChatCount(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      tokenBalance: true,
      freeChatCount: true,
    },
  });
  if (!user || user.freeChatCount <= 0) return user;

  return prisma.user.update({
    where: { id: userId },
    data: { freeChatCount: { decrement: 1 } },
    select: {
      id: true,
      email: true,
      tokenBalance: true,
      freeChatCount: true,
    },
  });
}
