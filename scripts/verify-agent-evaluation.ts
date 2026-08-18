import { prisma } from "../lib/db";
import { SERVICE_CONFIG } from "../lib/constants";
import { toOpenAITools } from "../lib/tool-registry";
import {
  createAgentFeedback,
  getEvaluationStats,
} from "../lib/agent-evaluation";
import { startAgentRun, finishAgentRun } from "../lib/agent-observability/runs";
import { recordAgentToolCall } from "../lib/agent-observability/tool-calls";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

async function main() {
  assert(SERVICE_CONFIG.SALES.cost === 0, "SALES stays free");
  for (const tool of toOpenAITools()) {
    const props =
      (tool.function.parameters as { properties?: Record<string, unknown> })
        .properties ?? {};
    assert(!("userId" in props), `${tool.function.name} has userId`);
  }

  const user = await prisma.user.create({
    data: {
      email: `eval11-${Date.now()}@example.local`,
      passwordHash: "test",
      tokenBalance: 18740,
      freeChatCount: 5,
    },
    select: { id: true, tokenBalance: true },
  });
  const runIds: string[] = [];
  const feedbackIds: string[] = [];

  try {
    const ok = await startAgentRun({
      userId: user.id,
      serviceType: "SALES",
      intent: "PRICE_QUERY",
    });
    assert(Boolean(ok), "start run");
    runIds.push(ok!.id);
    await recordAgentToolCall({
      agentRunId: ok!.id,
      toolName: "query_packages",
      arguments: {},
      result: { packages: [{ name: "基础套餐" }] },
      success: true,
      duration: 40,
    });
    await finishAgentRun(ok!.id, {
      success: true,
      toolsUsed: ["query_packages"],
      duration: 200,
      toolDuration: 40,
      llmDuration: 160,
    });

    const fail = await startAgentRun({
      userId: user.id,
      serviceType: "SALES",
      intent: "GENERAL_CHAT",
    });
    runIds.push(fail!.id);
    await prisma.agentLog.create({
      data: {
        userId: user.id,
        message: "帮我比一下 Dify",
        intent: "PRODUCT_COMPARE",
      },
    });
    await finishAgentRun(fail!.id, {
      success: false,
      error: new Error("DeepSeek 401 invalid api key sk-secretvalue"),
      duration: 20,
    });

    const fb = await createAgentFeedback({
      agentRunId: ok!.id,
      rating: 5,
      comment: "回答清楚",
    });
    feedbackIds.push(fb.id);

    const stats = await getEvaluationStats();
    assert(stats.tools.some((t) => t.name === "query_packages" && t.calls >= 1), "tool calls");
    assert(
      stats.tools.some(
        (t) => t.name === "query_packages" && t.successRate > 0 && t.averageDuration != null,
      ),
      "tool success/duration",
    );
    assert(typeof stats.sales.recommended === "number", "sales recommended");
    assert(typeof stats.sales.conversionRate === "number", "sales conversionRate");
    const err = stats.errors.find((row) => row.id === fail!.id);
    assert(Boolean(err), "error case present");
    assert(err?.errorType === "MODEL_ERROR", "error type");
    assert(err?.question.includes("Dify") || err?.question.includes("意图"), "question");
    assert(!String(err?.summary).includes("sk-"), "error summary redacted");
    assert(stats.feedback.count >= 1, "feedback count");
    assert((stats.feedback.averageRating ?? 0) >= 1, "average rating");

    const after = await prisma.user.findUnique({
      where: { id: user.id },
      select: { tokenBalance: true },
    });
    assert(after?.tokenBalance === user.tokenBalance, "token not deducted");
    assert(SERVICE_CONFIG.SALES.cost === 0, "SALES still free");

    console.log("OK agent-evaluation", {
      tools: stats.tools.slice(0, 3),
      sales: {
        recommended: stats.sales.recommended,
        conversionRate: stats.sales.conversionRate,
      },
      errorType: err?.errorType,
      feedbackAvg: stats.feedback.averageRating,
      salesCost: SERVICE_CONFIG.SALES.cost,
    });
  } finally {
    await prisma.agentFeedback.deleteMany({ where: { id: { in: feedbackIds } } });
    await prisma.agentToolCall.deleteMany({ where: { agentRunId: { in: runIds } } });
    await prisma.agentRun.deleteMany({ where: { id: { in: runIds } } });
    await prisma.agentLog.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
