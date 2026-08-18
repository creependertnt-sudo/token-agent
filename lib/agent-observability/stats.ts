import { prisma } from "@/lib/db";

export async function getAdminAgentStats() {
  const [totalRequests, successCount, toolGroups, failed] = await Promise.all([
    prisma.agentRun.count(),
    prisma.agentRun.count({ where: { success: true } }),
    prisma.agentToolCall.groupBy({
      by: ["toolName"],
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

  return {
    totalRequests,
    successRate,
    topTools,
    errors: failed.map((row) => ({
      message: row.errorMessage,
      serviceType: row.serviceType,
      createdAt: row.createdAt,
    })),
  };
}
