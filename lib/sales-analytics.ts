import { prisma } from "@/lib/db";
import { extractCustomerDemandSignals } from "@/lib/customer-analysis";
import {
  evaluateCustomerLevel,
  type CustomerLevel,
} from "@/lib/customer-level";
import type { CustomerMemoryRow } from "@/lib/customer-memory";

export type SalesFunnelStats = {
  shown: number;
  clicked: number;
  paid: number;
  clickRate: number;
  conversionRate: number;
};

export type SalesPackageStats = {
  packageId: string;
  name: string;
  tokenAmount: number;
  price: number;
  shown: number;
  clicked: number;
  paid: number;
  paidOrders: number;
};

export type CustomerLevelStats = Record<CustomerLevel, number> & {
  total: number;
};

export type SalesQuestionStats = {
  packageQueries: number;
  balanceQueries: number;
  memoryQueries: number;
  orderQueries: number;
  knowledgeQueries: number;
  difyComparisons: number;
  topTools: Array<{ name: string; count: number }>;
};

export type SalesAnalyticsStats = {
  funnel: SalesFunnelStats;
  packages: SalesPackageStats[];
  customerLevels: CustomerLevelStats;
  questions: SalesQuestionStats;
};

const EMPTY_LEVELS: CustomerLevelStats = {
  VIP: 0,
  HIGH_VALUE: 0,
  POTENTIAL: 0,
  LOW_VALUE: 0,
  total: 0,
};

function ratio(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 10000) / 10000;
}

function countByStatus(
  rows: Array<{ status: string; _count: { _all: number } }>,
): { shown: number; clicked: number; paid: number } {
  let currentShown = 0;
  let currentClicked = 0;
  let currentPaid = 0;
  for (const row of rows) {
    const n = row._count._all;
    const status = row.status.toUpperCase();
    if (status === "PAID") currentPaid += n;
    else if (status === "CLICKED") currentClicked += n;
    else if (status === "SHOWN") currentShown += n;
  }
  const shown = currentShown + currentClicked + currentPaid;
  const clicked = currentClicked + currentPaid;
  return { shown, clicked, paid: currentPaid };
}

function toMemoryRow(row: {
  industry: string;
  needs: string;
  budget: string;
  painPoints: string;
  purchaseHistory: string;
  recommendedModel: string;
  preferences: string;
  customerStage: string;
  confidence: string;
  lastIntent: string;
}): CustomerMemoryRow {
  const stage = row.customerStage as CustomerMemoryRow["customerStage"];
  const confidence = row.confidence as CustomerMemoryRow["confidence"];
  return {
    industry: row.industry,
    needs: row.needs,
    budget: row.budget,
    painPoints: row.painPoints,
    purchaseHistory: row.purchaseHistory,
    recommendedModel: row.recommendedModel,
    preferences: row.preferences,
    customerStage: ["NEW", "INTERESTED", "COMPARING", "READY_TO_BUY", "CUSTOMER"].includes(
      stage,
    )
      ? stage
      : "NEW",
    confidence:
      confidence === "medium" || confidence === "high" ? confidence : "low",
    lastIntent: row.lastIntent,
  };
}

/**
 * 只读销售分析。不写库，不参与扣费 / 路由 / 推荐。
 */
export async function getSalesAnalyticsStats(): Promise<SalesAnalyticsStats> {
  const [
    conversionGroups,
    packages,
    conversionByPackage,
    paidOrders,
    users,
    toolGroups,
    knowledgeCalls,
  ] = await Promise.all([
    prisma.salesConversion.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
    prisma.tokenPackage.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        name: true,
        tokenAmount: true,
        price: true,
      },
    }),
    prisma.salesConversion.groupBy({
      by: ["packageId", "status"],
      _count: { _all: true },
    }),
    prisma.order.groupBy({
      by: ["packageId"],
      where: { status: "SUCCESS" },
      _count: { _all: true },
    }),
    prisma.user.findMany({
      select: {
        tokenBalance: true,
        customerMemory: true,
        orders: {
          where: { status: "SUCCESS" },
          orderBy: { createdAt: "desc" },
          take: 20,
          select: {
            tokenAmount: true,
            package: { select: { name: true } },
          },
        },
      },
    }),
    prisma.agentToolCall.groupBy({
      by: ["toolName"],
      _count: { _all: true },
    }),
    prisma.agentToolCall.findMany({
      where: { toolName: "search_knowledge" },
      select: { arguments: true, resultSummary: true },
    }),
  ]);

  const funnelCounts = countByStatus(conversionGroups);
  const funnel: SalesFunnelStats = {
    ...funnelCounts,
    clickRate: ratio(funnelCounts.clicked, funnelCounts.shown),
    conversionRate: ratio(funnelCounts.paid, funnelCounts.shown),
  };

  const convMap = new Map<string, Array<{ status: string; _count: { _all: number } }>>();
  for (const row of conversionByPackage) {
    const list = convMap.get(row.packageId) ?? [];
    list.push(row);
    convMap.set(row.packageId, list);
  }
  const orderMap = new Map(
    paidOrders.map((row) => [row.packageId, row._count._all]),
  );

  const packageStats: SalesPackageStats[] = packages.map((pkg) => {
    const counts = countByStatus(convMap.get(pkg.id) ?? []);
    return {
      packageId: pkg.id,
      name: pkg.name,
      tokenAmount: pkg.tokenAmount,
      price: pkg.price,
      shown: counts.shown,
      clicked: counts.clicked,
      paid: counts.paid,
      paidOrders: orderMap.get(pkg.id) ?? 0,
    };
  });

  const customerLevels: CustomerLevelStats = { ...EMPTY_LEVELS };
  for (const user of users) {
    const memory = user.customerMemory
      ? toMemoryRow(user.customerMemory)
      : null;
    const blob = [
      memory?.needs ?? "",
      memory?.painPoints ?? "",
      memory?.industry ?? "",
      memory?.lastIntent ?? "",
      memory?.purchaseHistory ?? "",
    ]
      .join(" ")
      .trim();
    const level = evaluateCustomerLevel({
      tokenBalance: user.tokenBalance,
      recentOrders: user.orders.map((order) => ({
        packageName: order.package.name,
        tokenAmount: order.tokenAmount,
      })),
      signals: extractCustomerDemandSignals(blob),
      memory,
      message: blob,
      customerType: /企业|公司/.test(memory?.industry ?? "")
        ? "ENTERPRISE"
        : null,
    }).level;
    customerLevels[level] += 1;
    customerLevels.total += 1;
  }

  const toolCount = (name: string) =>
    toolGroups.find((row) => row.toolName === name)?._count._all ?? 0;

  const difyComparisons = knowledgeCalls.filter((row) => {
    const text = `${row.arguments ?? ""} ${row.resultSummary ?? ""}`;
    return /dify/i.test(text);
  }).length;

  const questions: SalesQuestionStats = {
    packageQueries: toolCount("query_packages"),
    balanceQueries: toolCount("query_balance"),
    memoryQueries: toolCount("query_memory"),
    orderQueries: toolCount("query_orders"),
    knowledgeQueries: toolCount("search_knowledge"),
    difyComparisons,
    topTools: toolGroups
      .map((row) => ({ name: row.toolName, count: row._count._all }))
      .sort((a, b) => b.count - a.count),
  };

  return {
    funnel,
    packages: packageStats,
    customerLevels,
    questions,
  };
}
