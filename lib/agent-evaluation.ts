import { prisma } from "@/lib/db";
import { toPublicError, redactLogText } from "@/lib/error-handler";
import { getSalesAnalyticsStats } from "@/lib/sales-analytics";

export type ToolQualityRow = {
  name: string;
  calls: number;
  successCount: number;
  successRate: number;
  averageDuration: number | null;
};

export type SalesEffectStats = {
  recommended: number;
  clicked: number;
  paid: number;
  conversionRate: number;
  packages: Array<{
    name: string;
    shown: number;
    clicked: number;
    paid: number;
  }>;
};

export type EvaluationErrorCase = {
  id: string;
  errorType: string;
  question: string;
  summary: string;
  serviceType: string;
  createdAt: Date;
};

export type FeedbackSummary = {
  count: number;
  averageRating: number | null;
  recent: Array<{
    id: string;
    agentRunId: string;
    rating: number;
    comment: string | null;
    createdAt: Date;
  }>;
};

export type EvaluationStats = {
  tools: ToolQualityRow[];
  sales: SalesEffectStats;
  errors: EvaluationErrorCase[];
  feedback: FeedbackSummary;
  recentRuns: Array<{
    id: string;
    intent: string | null;
    success: boolean;
    serviceType: string;
    createdAt: Date;
  }>;
};

function classifyStoredError(message: string | null): string {
  if (!message) return "UNKNOWN_ERROR";
  if (/额度不足/.test(message)) return "TOKEN_ERROR";
  if (/工具调用失败/.test(message)) return "TOOL_ERROR";
  if (/连接已中断/.test(message)) return "SSE_ERROR";
  if (/AI服务暂时不可用/.test(message)) return "MODEL_ERROR";
  if (/服务暂时不可用/.test(message)) return "DATABASE_ERROR";
  return toPublicError(new Error(message)).code;
}

/**
 * 只读评估聚合。不改 Agent 行为，不参与扣费 / 推荐。
 */
export async function getEvaluationStats(): Promise<EvaluationStats> {
  const [toolGroups, sales, failed, logs, ratingAgg, recentFeedback, recentRuns] =
    await Promise.all([
      prisma.agentToolCall.groupBy({
        by: ["toolName", "success"],
        _count: { _all: true },
        _avg: { duration: true },
      }),
      getSalesAnalyticsStats(),
      prisma.agentRun.findMany({
        where: { success: false },
        orderBy: { createdAt: "desc" },
        take: 30,
        select: {
          id: true,
          userId: true,
          intent: true,
          errorMessage: true,
          serviceType: true,
          createdAt: true,
        },
      }),
      prisma.agentLog.findMany({
        orderBy: { createdAt: "desc" },
        take: 300,
        select: { userId: true, message: true, createdAt: true },
      }),
      prisma.agentFeedback.aggregate({
        _avg: { rating: true },
        _count: { _all: true },
      }),
      prisma.agentFeedback.findMany({
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          agentRunId: true,
          rating: true,
          comment: true,
          createdAt: true,
        },
      }),
      prisma.agentRun.findMany({
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          intent: true,
          success: true,
          serviceType: true,
          createdAt: true,
        },
      }),
    ]);

  const toolMap = new Map<
    string,
    { calls: number; successCount: number; durationSum: number; durationN: number }
  >();
  for (const row of toolGroups) {
    const current = toolMap.get(row.toolName) ?? {
      calls: 0,
      successCount: 0,
      durationSum: 0,
      durationN: 0,
    };
    current.calls += row._count._all;
    if (row.success) current.successCount += row._count._all;
    if (row._avg.duration != null) {
      current.durationSum += row._avg.duration * row._count._all;
      current.durationN += row._count._all;
    }
    toolMap.set(row.toolName, current);
  }

  const tools: ToolQualityRow[] = [...toolMap.entries()]
    .map(([name, row]) => ({
      name,
      calls: row.calls,
      successCount: row.successCount,
      successRate: row.calls === 0 ? 0 : row.successCount / row.calls,
      averageDuration:
        row.durationN === 0 ? null : Math.round(row.durationSum / row.durationN),
    }))
    .sort((a, b) => b.calls - a.calls);

  const errors: EvaluationErrorCase[] = failed.map((run) => {
    const nearby = logs
      .filter((log) => log.userId === run.userId)
      .sort(
        (a, b) =>
          Math.abs(a.createdAt.getTime() - run.createdAt.getTime()) -
          Math.abs(b.createdAt.getTime() - run.createdAt.getTime()),
      )[0];
    const question = nearby?.message?.trim()
      ? redactLogText(nearby.message, 120)
      : run.intent
        ? `意图：${run.intent}`
        : "（未记录问题）";
    return {
      id: run.id,
      errorType: classifyStoredError(run.errorMessage),
      question,
      summary: redactLogText(run.errorMessage ?? "未知错误", 160),
      serviceType: run.serviceType,
      createdAt: run.createdAt,
    };
  });

  const avg = ratingAgg._avg.rating;
  return {
    tools,
    sales: {
      recommended: sales.funnel.shown,
      clicked: sales.funnel.clicked,
      paid: sales.funnel.paid,
      conversionRate: sales.funnel.conversionRate,
      packages: sales.packages.map((pkg) => ({
        name: pkg.name,
        shown: pkg.shown,
        clicked: pkg.clicked,
        paid: pkg.paid,
      })),
    },
    errors,
    feedback: {
      count: ratingAgg._count._all,
      averageRating: avg == null || Number.isNaN(avg) ? null : Math.round(avg * 10) / 10,
      recent: recentFeedback,
    },
    recentRuns,
  };
}

export async function createAgentFeedback(input: {
  agentRunId: string;
  rating: number;
  comment?: string | null;
}) {
  const rating = Number(input.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw new EvaluationError("评分必须是 1 到 5 的整数。", 400);
  }
  const run = await prisma.agentRun.findUnique({
    where: { id: input.agentRunId },
    select: { id: true },
  });
  if (!run) throw new EvaluationError("对应的 AgentRun 不存在。", 404);
  const comment = input.comment?.trim()
    ? redactLogText(input.comment.trim(), 500)
    : null;
  return prisma.agentFeedback.create({
    data: {
      agentRunId: input.agentRunId,
      rating,
      comment,
    },
    select: {
      id: true,
      agentRunId: true,
      rating: true,
      comment: true,
      createdAt: true,
    },
  });
}

export class EvaluationError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "EvaluationError";
    this.status = status;
  }
}
