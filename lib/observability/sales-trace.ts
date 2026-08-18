import { prisma } from "@/lib/db";

async function swallow<T>(work: () => Promise<T>): Promise<T | null> {
  try {
    return await work();
  } catch (error) {
    console.error("[obs:sales]", error);
    return null;
  }
}

async function latestFunnel(input: {
  userId?: string | null;
  packageId?: string | null;
}) {
  if (input.userId && input.packageId) {
    return prisma.salesFunnelLog.findFirst({
      where: { userId: input.userId, packageId: input.packageId },
      orderBy: { createdAt: "desc" },
    });
  }
  if (input.userId) {
    return prisma.salesFunnelLog.findFirst({
      where: { userId: input.userId },
      orderBy: { createdAt: "desc" },
    });
  }
  return null;
}

export async function recordFunnelShown(input: {
  userId?: string | null;
  packageId?: string | null;
  strategy?: string | null;
}): Promise<{ id: string } | null> {
  return swallow(async () => {
    const row = await prisma.salesFunnelLog.create({
      data: {
        userId: input.userId ?? null,
        packageId: input.packageId ?? null,
        strategy: input.strategy ?? null,
        shown: true,
        clicked: false,
        paid: false,
      },
      select: { id: true },
    });
    return row;
  });
}

export async function recordFunnelClicked(input: {
  userId?: string | null;
  packageId?: string | null;
}): Promise<void> {
  await swallow(async () => {
    const existing = await latestFunnel(input);
    if (existing) {
      if (existing.paid || existing.clicked) return;
      await prisma.salesFunnelLog.update({
        where: { id: existing.id },
        data: { clicked: true },
      });
      return;
    }
    await prisma.salesFunnelLog.create({
      data: {
        userId: input.userId ?? null,
        packageId: input.packageId ?? null,
        shown: true,
        clicked: true,
        paid: false,
      },
    });
  });
}

export async function recordFunnelPaid(input: {
  userId?: string | null;
  packageId?: string | null;
}): Promise<void> {
  await swallow(async () => {
    const existing = await latestFunnel(input);
    if (existing) {
      if (existing.paid) return;
      await prisma.salesFunnelLog.update({
        where: { id: existing.id },
        data: { shown: true, clicked: true, paid: true },
      });
      return;
    }
    await prisma.salesFunnelLog.create({
      data: {
        userId: input.userId ?? null,
        packageId: input.packageId ?? null,
        shown: true,
        clicked: true,
        paid: true,
      },
    });
  });
}
