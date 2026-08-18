import { prisma } from "../lib/db";
import { SERVICE_CONFIG } from "../lib/constants";
import { toOpenAITools } from "../lib/tool-registry";
import { startAgentRun, finishAgentRun } from "../lib/agent-observability/runs";
import { recordAgentToolCall } from "../lib/agent-observability/tool-calls";
import { getAdminAgentStats } from "../lib/agent-observability/stats";
import { inferMemoryUsage } from "../lib/agent-observability/memory";
import { toPublicError } from "../lib/error-handler";
import { sanitizeToolArguments } from "../lib/agent-observability/sanitize";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

async function main() {
  assert(SERVICE_CONFIG.SALES.cost === 0, "SALES stays free");

  const schemas = toOpenAITools();
  for (const tool of schemas) {
    const props = (tool.function.parameters as { properties?: Record<string, unknown> })
      .properties ?? {};
    assert(!("userId" in props), `${tool.function.name} schema has userId`);
  }

  const testUser = await prisma.user.create({
    data: {
      email: `obs7-${Date.now()}@example.local`,
      passwordHash: "test",
      tokenBalance: 1000,
      freeChatCount: 5,
    },
    select: { id: true, tokenBalance: true },
  });

  const createdRuns: string[] = [];

  try {
    // 1 你好 → Tool=0
    const hello = await startAgentRun({
      userId: testUser.id,
      serviceType: "SALES",
      modelType: "deepseek-chat",
      intent: "GENERAL_CHAT",
      memoryInjectedCount: 2,
      memoryCategory: "business",
    });
    assert(Boolean(hello), "hello run");
    createdRuns.push(hello!.id);
    await finishAgentRun(hello!.id, {
      success: true,
      intent: "GENERAL_CHAT",
      toolsUsed: [],
      duration: 80,
      toolDuration: 0,
      llmDuration: 80,
      memoryUsedCount: 0,
    });
    const helloRow = await prisma.agentRun.findUnique({ where: { id: hello!.id } });
    assert(helloRow?.toolCount === 0, "hello toolCount=0");
    assert(helloRow?.success === true, "hello success");

    // 2 我的余额？ → query_balance
    const bal = await startAgentRun({
      userId: testUser.id,
      serviceType: "SALES",
      modelType: "deepseek-chat",
      intent: "GENERAL_CHAT",
    });
    createdRuns.push(bal!.id);
    await recordAgentToolCall({
      agentRunId: bal!.id,
      toolName: "query_balance",
      arguments: { userId: "should-be-stripped", query: "余额" },
      result: { tokenBalance: 18740 },
      success: true,
      duration: 120,
    });
    await finishAgentRun(bal!.id, {
      success: true,
      toolsUsed: ["query_balance"],
      duration: 400,
      toolDuration: 120,
      llmDuration: 260,
    });
    const balCall = await prisma.agentToolCall.findFirst({
      where: { agentRunId: bal!.id, toolName: "query_balance" },
    });
    assert(Boolean(balCall), "query_balance recorded");
    assert(balCall?.success === true, "query_balance success");
    assert(balCall?.resultSummary === "18740 Token", "balance summary");
    assert(!String(balCall?.arguments ?? "").includes("should-be-stripped"), "userId stripped");

    // 3 有什么套餐 → query_packages
    const pkg = await startAgentRun({
      userId: testUser.id,
      serviceType: "SALES",
      modelType: "deepseek-chat",
      intent: "PRICE_QUERY",
    });
    createdRuns.push(pkg!.id);
    await recordAgentToolCall({
      agentRunId: pkg!.id,
      toolName: "query_packages",
      arguments: "{}",
      result: { packages: [{ name: "基础套餐" }, { name: "标准套餐" }, { name: "企业套餐" }] },
      success: true,
      duration: 90,
    });
    await finishAgentRun(pkg!.id, {
      success: true,
      toolsUsed: ["query_packages"],
      duration: 350,
      toolDuration: 90,
      llmDuration: 240,
    });
    const pkgCall = await prisma.agentToolCall.findFirst({
      where: { agentRunId: pkg!.id, toolName: "query_packages" },
    });
    assert(pkgCall?.resultSummary === "3 packages", "packages summary");

    const mem = inferMemoryUsage({
      injectedCount: 4,
      toolNames: ["query_memory"],
      categories: ["business"],
    });
    assert(mem.memoryUsedCount === 1, "memory used when query_memory");
    assert(mem.memoryInjectedCount === 4, "memory injected");

    // 4 DeepSeek 失败 → success=false, public error, Token 不扣
    const beforeBalance = testUser.tokenBalance;
    const fail = await startAgentRun({
      userId: testUser.id,
      serviceType: "SALES",
      modelType: "deepseek-chat",
      intent: "GENERAL_CHAT",
    });
    createdRuns.push(fail!.id);
    const publicErr = toPublicError(new Error("DeepSeek 401 invalid api key sk-secretvalue"));
    assert(publicErr.code === "MODEL_ERROR", "model error code");
    assert(!publicErr.message.includes("sk-"), "no key in public message");
    await finishAgentRun(fail!.id, {
      success: false,
      error: new Error("DeepSeek 401 invalid api key sk-secretvalue"),
      duration: 30,
      toolDuration: 0,
      llmDuration: 30,
    });
    const failRow = await prisma.agentRun.findUnique({ where: { id: fail!.id } });
    assert(failRow?.success === false, "fail success=false");
    assert(Boolean(failRow?.errorMessage), "errorMessage present");
    assert(!String(failRow?.errorMessage).includes("sk-"), "errorMessage redacted");
    const afterUser = await prisma.user.findUnique({
      where: { id: testUser.id },
      select: { tokenBalance: true },
    });
    assert(afterUser?.tokenBalance === beforeBalance, "token not deducted");
    assert(SERVICE_CONFIG.SALES.cost === 0, "SALES still free");

    const stats = await getAdminAgentStats();
    assert(stats.totalRequests >= 4, "stats total");
    assert(typeof stats.successRate === "string", "successRate string");
    assert(stats.topTools.some((t) => t.name === "query_balance"), "top tools");

    const leaked = sanitizeToolArguments({
      userId: "attacker",
      password: "secret",
      query: "余额",
    });
    assert(!String(leaked).includes("attacker"), "sanitize userId");
    assert(!String(leaked).includes("secret"), "sanitize password");

    console.log("OK agent-observability", {
      helloTools: helloRow?.toolCount,
      balance: balCall?.resultSummary,
      packages: pkgCall?.resultSummary,
      fail: failRow?.errorMessage,
      salesCost: SERVICE_CONFIG.SALES.cost,
      stats: {
        totalRequests: stats.totalRequests,
        successRate: stats.successRate,
        topTools: stats.topTools.slice(0, 3),
      },
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
