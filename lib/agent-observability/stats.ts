import { prisma } from "@/lib/db";

export type AdminAgentToolRank = {
  name: string;
  count: number;
};

export type AdminAgentErrorStat = {
  message: string;
  count: number;
};

export type AdminAgentRecentError = {
  message: string | null;
  serviceType: string;
  createdAt: Date;
};

export type AdminAgentStats = {
  totalRequests: number;
  successCount: number;
  successRate: string;
  /** 有 duration 的请求平均值（毫秒）；无数据为 null */
  averageDuration: number | null;
  topTools: AdminAgentToolRank[];
  errorCount: number;
  errorStats: AdminAgentErrorStat[];
  errors: AdminAgentRecentError[];
};

/**
 * 只读聚合 AgentRun / AgentToolCall。
 * 不写库、不参与扣费 / 路由 / 推荐。
 */
export async function getAdminAgentStats(): Promise<AdminAgentStats> {
  const [
    totalRequests,
    successCount,
    durationAgg,
    toolGroups,
    errorCount,
    errorGroups,
    failed,
  ] = await Promise.all([
    prisma.agentRun.count(),
    prisma.agentRun.count({ where: { success: true } }),
    prisma.agentRun.aggregate({
      _avg: { duration: true },
    }),
    prisma.agentToolCall.groupBy({
      by: ["toolName"],
      _count: { _all: true },
    }),
    prisma.agentRun.count({ where: { success: false } }),
    prisma.agentRun.groupBy({
      by: ["errorMessage"],
      where: { success: false, errorMessage: { not: null } },
      _count: { _all: true },
    }),
    prisma.agentRun.findMany({
      where: { success: false },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        errorMessage: true,
        serviceType: true,
        createdAt: true,
      },
    }),
  ]);

  const topTools = toolGroups
    .map((row) => ({
      name: row.toolName,
      count: row._count._all,
    }))
    .sort((a, b) => b.count - a.count);

  const successRate =
    totalRequests === 0
      ? "100%"
      : `${Math.round((successCount / totalRequests) * 100)}%`;

  const rawAvg = durationAgg._avg.duration;
  const averageDuration =
    rawAvg == null || Number.isNaN(rawAvg) ? null : Math.round(rawAvg);

  const errorStats = errorGroups
    .map((row) => ({
      message: row.errorMessage ?? "未知错误",
      count: row._count._all,
    }))
    .sort((a, b) => b.count - a.count);

  return {
    totalRequests,
    successCount,
    successRate,
    averageDuration,
    topTools,
    errorCount,
    errorStats,
    errors: failed.map((row) => ({
      message: row.errorMessage,
      serviceType: row.serviceType,
      createdAt: row.createdAt,
    })),
  };
}
