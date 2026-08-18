import fs from "fs";
import { prisma } from "../lib/db";
import { sqliteDumpPath, type SqliteDump } from "./db-tables";

export type DatabaseCheckResult = {
  ok: boolean;
  issues: string[];
  live: Record<string, number | Record<string, number>>;
  comparedDump: boolean;
};

function assertEqual(
  issues: string[],
  label: string,
  expected: number,
  actual: number,
) {
  if (expected !== actual) {
    issues.push(`${label}: expected ${expected}, got ${actual}`);
  }
}

export async function checkDatabase(): Promise<DatabaseCheckResult> {
  const issues: string[] = [];

  const [
    userCount,
    tokenBalanceAgg,
    orders,
    memoryCount,
    customerMemoryCount,
    agentRunCount,
    agentToolCallCount,
    agentFeedbackCount,
    knowledgeCount,
    competitorCount,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.aggregate({ _sum: { tokenBalance: true } }),
    prisma.order.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
    prisma.agentMemory.count(),
    prisma.customerMemory.count(),
    prisma.agentRun.count(),
    prisma.agentToolCall.count(),
    prisma.agentFeedback.count(),
    prisma.salesKnowledge.count(),
    prisma.competitorKnowledge.count(),
  ]);

  const orderStatus: Record<string, number> = {};
  for (const row of orders) {
    orderStatus[row.status] = row._count._all;
  }

  const live = {
    users: userCount,
    tokenBalanceSum: tokenBalanceAgg._sum.tokenBalance ?? 0,
    orders: orderStatus,
    memory: memoryCount,
    customerMemory: customerMemoryCount,
    agentRuns: agentRunCount,
    agentToolCalls: agentToolCallCount,
    agentFeedbacks: agentFeedbackCount,
    salesKnowledge: knowledgeCount,
    competitorKnowledge: competitorCount,
  };

  let comparedDump = false;
  const dumpFile = sqliteDumpPath();
  if (fs.existsSync(dumpFile)) {
    comparedDump = true;
    const dump = JSON.parse(fs.readFileSync(dumpFile, "utf8")) as SqliteDump;
    const users = dump.tables.User ?? [];
    const dumpTokenSum = users.reduce(
      (sum, row) => sum + Number(row.tokenBalance ?? 0),
      0,
    );
    const dumpOrders = dump.tables.Order ?? [];
    const dumpOrderStatus: Record<string, number> = {};
    for (const row of dumpOrders) {
      const status = String(row.status ?? "");
      dumpOrderStatus[status] = (dumpOrderStatus[status] ?? 0) + 1;
    }

    assertEqual(issues, "users", users.length, userCount);
    assertEqual(issues, "tokenBalanceSum", dumpTokenSum, live.tokenBalanceSum);
    assertEqual(issues, "memory", dump.tables.AgentMemory?.length ?? 0, memoryCount);
    assertEqual(
      issues,
      "agentRuns",
      dump.tables.AgentRun?.length ?? 0,
      agentRunCount,
    );
    for (const status of new Set([
      ...Object.keys(dumpOrderStatus),
      ...Object.keys(orderStatus),
    ])) {
      assertEqual(
        issues,
        `orders.${status}`,
        dumpOrderStatus[status] ?? 0,
        orderStatus[status] ?? 0,
      );
    }
  }

  return { ok: issues.length === 0, issues, live, comparedDump };
}

async function main() {
  const result = await checkDatabase();
  if (!result.ok) {
    console.error("FAIL check-database", result.issues);
    process.exit(1);
  }
  console.log("PASS 数据完整", result.live, {
    comparedDump: result.comparedDump,
  });
}

if (process.argv[1]?.includes("check-database")) {
  main()
    .catch((error) => {
      console.error(error);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
