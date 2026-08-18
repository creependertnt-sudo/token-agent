import { prisma } from "@/lib/db";
import { OrderStatus } from "@/app/generated/prisma/enums";

export type AdminOverviewStats = {
  todayRequests: number;
  successRate: string;
  averageDuration: number | null;
  topTool: { name: string; count: number } | null;
  paidOrders: number;
};

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export async function getAdminOverviewStats(): Promise<AdminOverviewStats> {
  const since = startOfToday();

  const [todayRequests, successCount, durationAgg, toolGroups, paidOrders] =
    await Promise.all([
      prisma.agentRun.count({ where: { createdAt: { gte: since } } }),
      prisma.agentRun.count({
        where: { createdAt: { gte: since }, success: true },
      }),
      prisma.agentRun.aggregate({
        where: { createdAt: { gte: since } },
        _avg: { duration: true },
      }),
      prisma.agentToolCall.groupBy({
        by: ["toolName"],
        where: { createdAt: { gte: since } },
        _count: { _all: true },
      }),
      prisma.order.count({
        where: { createdAt: { gte: since }, status: OrderStatus.SUCCESS },
      }),
    ]);

  const successRate =
    todayRequests === 0
      ? "100%"
      : `${Math.round((successCount / todayRequests) * 1000) / 10}%`;

  const rawAvg = durationAgg._avg.duration;
  const topTool = toolGroups
    .map((row) => ({ name: row.toolName, count: row._count._all }))
    .sort((a, b) => b.count - a.count)[0] ?? null;

  return {
    todayRequests,
    successRate,
    averageDuration:
      rawAvg == null || Number.isNaN(rawAvg) ? null : Math.round(rawAvg),
    topTool,
    paidOrders,
  };
}
