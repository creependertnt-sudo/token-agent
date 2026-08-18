import { OrderStatus } from "../app/generated/prisma/enums";
import { prisma } from "../lib/db";
import { SERVICE_CONFIG } from "../lib/constants";
import { createAgentTrace, finishAgentTrace, getObservabilityStats } from "../lib/observability/agent-trace";
import { createToolTrace, finishToolTrace } from "../lib/observability/tool-trace";
import { recordAgentError } from "../lib/observability/error-trace";
import { runToolCall } from "../lib/tool-runner";
import {
  markSalesConversionPaid,
  recordSalesConversionShown,
} from "../lib/sales-conversion-log";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

async function main() {
  assert(SERVICE_CONFIG.SALES.cost === 0, "SALES stays free");

  const testUser = await prisma.user.create({
    data: {
      email: `obs-test-${Date.now()}@example.local`,
      passwordHash: "test",
      tokenBalance: 18740,
      freeChatCount: 3,
    },
    select: { id: true },
  });

  const pkg = await prisma.tokenPackage.findFirst({
    where: { active: true },
    select: { id: true, tokenAmount: true, price: true },
  });
  assert(Boolean(pkg), "active package required");

  const created: {
    traces: string[];
    conversions: string[];
    orders: string[];
  } = { traces: [], conversions: [], orders: [] };

  try {
    // 测试1：我的余额？ → AgentTrace + ToolCallLog query_balance
    const trace1 = await createAgentTrace({
      userId: testUser.id,
      serviceType: "SALES",
      intent: "GENERAL_CHAT",
      model: "deepseek-chat",
    });
    assert(Boolean(trace1), "agent trace created");
    created.traces.push(trace1!.id);

    const handle = createToolTrace({
      traceId: trace1!.id,
      userId: testUser.id,
      toolName: "query_balance",
      arguments: "{}",
    });
    const ran = await runToolCall(
      { name: "query_balance", arguments: "{}" },
      { userId: testUser.id },
    );
    assert(ran.ok === true, "balance tool still isolated");
    const balance = ran.result as { tokenBalance: number };
    assert(balance.tokenBalance === 18740, "balance tool still isolated");
    await finishToolTrace(handle, { success: true });
    await finishAgentTrace(trace1!.id, {
      status: "SUCCESS",
      latency: 80,
      model: "deepseek-chat",
      intent: "GENERAL_CHAT",
    });

    const toolLog = await prisma.toolCallLog.findFirst({
      where: { userId: testUser.id, toolName: "query_balance" },
    });
    assert(Boolean(toolLog), "query_balance logged");
    assert(toolLog?.success === true, "query_balance success");

    // 测试2：我想买token → SalesFunnelLog shown + packageId
    const shown = await recordSalesConversionShown({
      userId: testUser.id,
      packageId: pkg!.id,
      strategy: "STRONG",
    });
    created.conversions.push(shown.id);
    const funnelShown = await prisma.salesFunnelLog.findFirst({
      where: { userId: testUser.id, packageId: pkg!.id, shown: true },
      orderBy: { createdAt: "desc" },
    });
    assert(Boolean(funnelShown), "funnel shown");
    assert(Boolean(funnelShown?.packageId), "funnel packageId");
    assert(funnelShown?.shown === true, "shown=true");

    // 测试3：支付成功 → paid=true
    const order = await prisma.order.create({
      data: {
        userId: testUser.id,
        packageId: pkg!.id,
        tokenAmount: pkg!.tokenAmount,
        amount: pkg!.price,
        status: OrderStatus.SUCCESS,
      },
    });
    created.orders.push(order.id);
    await markSalesConversionPaid({
      userId: testUser.id,
      packageId: pkg!.id,
    });
    const funnelPaid = await prisma.salesFunnelLog.findFirst({
      where: { userId: testUser.id, packageId: pkg!.id },
      orderBy: { createdAt: "desc" },
    });
    assert(funnelPaid?.paid === true, "paid=true");

    // 测试4：DeepSeek 失败 → AgentErrorLog
    const err = await recordAgentError({
      type: "deepseek",
      message: "DeepSeek失败",
      traceId: trace1!.id,
    });
    assert(Boolean(err), "error log created");
    const errorRow = await prisma.agentErrorLog.findFirst({
      where: { id: err!.id, type: "deepseek" },
    });
    assert(Boolean(errorRow), "DeepSeek error exists");

    const stats = await getObservabilityStats();
    assert(stats.requests >= 1, "stats requests");
    assert((stats.tools.query_balance ?? 0) >= 1, "stats tools");
    assert(stats.sales.shown >= 1, "stats shown");
    assert(stats.sales.paid >= 1, "stats paid");
    assert(stats.errors >= 1, "stats errors");

    console.log("OK observability", {
      trace: trace1!.id,
      tool: "query_balance",
      funnel: { shown: funnelShown?.shown, paid: funnelPaid?.paid, packageId: pkg!.id },
      errorType: errorRow?.type,
      stats,
      salesCost: SERVICE_CONFIG.SALES.cost,
    });
  } finally {
    await prisma.toolCallLog.deleteMany({
      where: { userId: testUser.id },
    });
    await prisma.agentErrorLog.deleteMany({
      where: { traceId: { in: created.traces } },
    });
    await prisma.agentTrace.deleteMany({
      where: { id: { in: created.traces } },
    });
    await prisma.salesFunnelLog.deleteMany({ where: { userId: testUser.id } });
    await prisma.salesConversion.deleteMany({ where: { userId: testUser.id } });
    await prisma.order.deleteMany({ where: { id: { in: created.orders } } });
    await prisma.agentMemory.deleteMany({ where: { userId: testUser.id } });
    await prisma.user.delete({ where: { id: testUser.id } });
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
