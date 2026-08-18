import { prisma } from "../lib/db";
import { SERVICE_CONFIG } from "../lib/constants";
import { getAdminAgentStats } from "../lib/agent-observability/stats";
import { startAgentRun, finishAgentRun } from "../lib/agent-observability/runs";
import { recordAgentToolCall } from "../lib/agent-observability/tool-calls";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

async function main() {
  assert(SERVICE_CONFIG.SALES.cost === 0, "SALES stays free");

  const testUser = await prisma.user.create({
    data: {
      email: `admin8-${Date.now()}@example.local`,
      passwordHash: "test",
      tokenBalance: 18740,
      freeChatCount: 5,
    },
    select: { id: true, tokenBalance: true },
  });

  const createdRuns: string[] = [];

  try {
    const before = testUser.tokenBalance;

    const fast = await startAgentRun({
      userId: testUser.id,
      serviceType: "SALES",
      intent: "GENERAL_CHAT",
    });
    assert(Boolean(fast), "fast run");
    createdRuns.push(fast!.id);
    await finishAgentRun(fast!.id, {
      success: true,
      duration: 100,
      toolDuration: 0,
      llmDuration: 100,
      toolsUsed: [],
    });

    const withTool = await startAgentRun({
      userId: testUser.id,
      serviceType: "SALES",
      intent: "PRICE_QUERY",
    });
    createdRuns.push(withTool!.id);
    await recordAgentToolCall({
      agentRunId: withTool!.id,
      toolName: "query_packages",
      arguments: {},
      result: { packages: [{ name: "基础套餐" }] },
      success: true,
      duration: 40,
    });
    await finishAgentRun(withTool!.id, {
      success: true,
      duration: 300,
      toolDuration: 40,
      llmDuration: 260,
      toolsUsed: ["query_packages"],
    });

    const fail = await startAgentRun({
      userId: testUser.id,
      serviceType: "SALES",
      intent: "GENERAL_CHAT",
    });
    createdRuns.push(fail!.id);
    await finishAgentRun(fail!.id, {
      success: false,
      error: new Error("DeepSeek 401 invalid api key sk-secretvalue"),
      duration: 50,
      toolDuration: 0,
      llmDuration: 50,
    });

    const stats = await getAdminAgentStats();
    assert(stats.totalRequests >= 3, "totalRequests");
    assert(typeof stats.successRate === "string", "successRate string");
    assert(stats.averageDuration != null && stats.averageDuration > 0, "averageDuration");
    assert(stats.topTools.some((t) => t.name === "query_packages"), "tool rank");
    assert(stats.errorCount >= 1, "errorCount");
    assert(stats.errorStats.length >= 1, "errorStats");
    assert(
      stats.errorStats.every((row) => !row.message.includes("sk-")),
      "error stats redacted",
    );

    const after = await prisma.user.findUnique({
      where: { id: testUser.id },
      select: { tokenBalance: true },
    });
    assert(after?.tokenBalance === before, "token not deducted");
    assert(SERVICE_CONFIG.SALES.cost === 0, "SALES still free");

    console.log("OK admin-agent", {
      totalRequests: stats.totalRequests,
      successRate: stats.successRate,
      averageDuration: stats.averageDuration,
      topTools: stats.topTools.slice(0, 3),
      errorCount: stats.errorCount,
      errorStats: stats.errorStats.slice(0, 3),
      salesCost: SERVICE_CONFIG.SALES.cost,
    });
  } finally {
    await prisma.agentToolCall.deleteMany({
      where: { agentRunId: { in: createdRuns } },
    });
    await prisma.agentRun.deleteMany({ where: { id: { in: createdRuns } } });
    await prisma.user.delete({ where: { id: testUser.id } });
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
