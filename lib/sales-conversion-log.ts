import { prisma } from "@/lib/db";
import {
  recordFunnelClicked,
  recordFunnelPaid,
  recordFunnelShown,
} from "@/lib/observability/sales-trace";

export type ConversionStatus = "SHOWN" | "CLICKED" | "PAID";

export type RecommendedPackageSnapshot = {
  id: string;
  name: string;
  tokenAmount: number;
  price: number;
};

/**
 * 商品卡展示时落库。不参与扣费。
 */
export async function recordSalesConversionShown(input: {
  userId: string;
  conversationId?: string | null;
  packageId: string;
  strategy: string;
}): Promise<{ id: string }> {
  const row = await prisma.salesConversion.create({
    data: {
      userId: input.userId,
      conversationId: input.conversationId ?? null,
      packageId: input.packageId,
      strategy: input.strategy || "SOFT",
      status: "SHOWN",
    },
    select: { id: true },
  });
  await recordFunnelShown({
    userId: input.userId,
    packageId: input.packageId,
    strategy: input.strategy || "SOFT",
  });
  void prisma.conversionAnalytics
    .create({
      data: {
        packageId: input.packageId,
        action: "SHOWN",
      },
    })
    .catch((error) => {
      console.error("[conversion-analytics]", error);
    });
  return row;
}

/**
 * 用户点击购买 / 带着 package 进入充值页。
 * 不把 PAID 降级。
 */
export async function markSalesConversionClicked(input: {
  userId: string;
  conversionId?: string | null;
  packageId?: string | null;
}): Promise<{ id: string; packageId: string } | null> {
  const existing = input.conversionId
    ? await prisma.salesConversion.findFirst({
        where: { id: input.conversionId, userId: input.userId },
      })
    : input.packageId
      ? await prisma.salesConversion.findFirst({
          where: { userId: input.userId, packageId: input.packageId },
          orderBy: { createdAt: "desc" },
        })
      : await prisma.salesConversion.findFirst({
          where: { userId: input.userId },
          orderBy: { createdAt: "desc" },
        });

  if (!existing) return null;
  if (existing.status === "PAID") {
    await recordFunnelClicked({
      userId: input.userId,
      packageId: existing.packageId,
    });
    return { id: existing.id, packageId: existing.packageId };
  }
  if (existing.status === "CLICKED") {
    await recordFunnelClicked({
      userId: input.userId,
      packageId: existing.packageId,
    });
    return { id: existing.id, packageId: existing.packageId };
  }

  await prisma.salesConversion.update({
    where: { id: existing.id },
    data: { status: "CLICKED" },
  });
  await recordFunnelClicked({
    userId: input.userId,
    packageId: existing.packageId,
  });
  return { id: existing.id, packageId: existing.packageId };
}

/**
 * 支付成功：CLICKED/SHOWN → PAID。无记录则补一条 PAID。
 */
export async function markSalesConversionPaid(input: {
  userId: string;
  packageId: string;
}): Promise<void> {
  const existing = await prisma.salesConversion.findFirst({
    where: { userId: input.userId, packageId: input.packageId },
    orderBy: { createdAt: "desc" },
  });

  if (existing) {
    if (existing.status !== "PAID") {
      await prisma.salesConversion.update({
        where: { id: existing.id },
        data: { status: "PAID" },
      });
    }
    await recordFunnelPaid({
      userId: input.userId,
      packageId: input.packageId,
    });
    return;
  }

  await prisma.salesConversion.create({
    data: {
      userId: input.userId,
      packageId: input.packageId,
      strategy: "SOFT",
      status: "PAID",
    },
  });
  await recordFunnelPaid({
    userId: input.userId,
    packageId: input.packageId,
  });
}

/**
 * 余额不足旁路：取最近一次仍有效的推荐套餐。
 */
export async function getLatestRecommendedPackage(
  userId: string,
): Promise<RecommendedPackageSnapshot | null> {
  const row = await prisma.salesConversion.findFirst({
    where: {
      userId,
      status: { in: ["SHOWN", "CLICKED"] },
    },
    orderBy: { createdAt: "desc" },
    include: {
      package: {
        select: { id: true, name: true, tokenAmount: true, price: true },
      },
    },
  });

  if (!row?.package) return null;
  return {
    id: row.package.id,
    name: row.package.name,
    tokenAmount: row.package.tokenAmount,
    price: row.package.price,
  };
}
