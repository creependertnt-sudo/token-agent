import { prisma } from "../lib/db";
import { SERVICE_CONFIG } from "../lib/constants";
import { toOpenAITools } from "../lib/tool-registry";
import { getSalesAnalyticsStats } from "../lib/sales-analytics";
import { evaluateCustomerLevel } from "../lib/customer-level";
import { extractCustomerDemandSignals } from "../lib/customer-analysis";
import { startAgentRun, finishAgentRun } from "../lib/agent-observability/runs";
import { recordAgentToolCall } from "../lib/agent-observability/tool-calls";
import { OrderStatus } from "../app/generated/prisma/enums";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

async function main() {
  assert(SERVICE_CONFIG.SALES.cost === 0, "SALES stays free");

  const schemas = toOpenAITools();
  for (const tool of schemas) {
    const props =
      (tool.function.parameters as { properties?: Record<string, unknown> })
        .properties ?? {};
    assert(!("userId" in props), `${tool.function.name} schema has userId`);
  }

  const stamp = Date.now();
  const createdUserIds: string[] = [];
  const createdPackageIds: string[] = [];
  const createdRunIds: string[] = [];
  const createdConversionIds: string[] = [];
  const createdOrderIds: string[] = [];

  try {
    const basic = await prisma.tokenPackage.create({
      data: {
        key: `analytics-basic-${stamp}`,
        name: "基础套餐",
        tokenAmount: 10_000,
        price: 9.9,
        sortOrder: 91,
        active: true,
      },
    });
    const standard = await prisma.tokenPackage.create({
      data: {
        key: `analytics-std-${stamp}`,
        name: "标准套餐",
        tokenAmount: 50_000,
        price: 44,
        sortOrder: 92,
        active: true,
      },
    });
    createdPackageIds.push(basic.id, standard.id);

    const buyer = await prisma.user.create({
      data: {
        email: `sa-buyer-${stamp}@example.local`,
        passwordHash: "test",
        tokenBalance: 18740,
        freeChatCount: 5,
      },
    });
    createdUserIds.push(buyer.id);
    const beforeBalance = buyer.tokenBalance;

    const vip = await prisma.user.create({
      data: {
        email: `sa-vip-${stamp}@example.local`,
        passwordHash: "test",
        tokenBalance: 5000,
        customerMemory: {
          create: {
            industry: "企业软件",
            needs: "公司 50 个人高并发 API",
            budget: "high",
            lastIntent: "ENTERPRISE_PLAN",
          },
        },
      },
    });
    createdUserIds.push(vip.id);

    const highValue = await prisma.user.create({
      data: {
        email: `sa-hv-${stamp}@example.local`,
        passwordHash: "test",
        tokenBalance: 100,
        customerMemory: {
          create: {
            needs: "开发额度不够用，想升级",
            lastIntent: "UPGRADE",
          },
        },
      },
    });
    createdUserIds.push(highValue.id);

    const potential = await prisma.user.create({
      data: {
        email: `sa-pot-${stamp}@example.local`,
        passwordHash: "test",
        tokenBalance: 0,
        customerMemory: {
          create: {
            needs: "我想买 token",
            lastIntent: "PRICE_QUERY",
          },
        },
      },
    });
    createdUserIds.push(potential.id);

    const low = await prisma.user.create({
      data: {
        email: `sa-low-${stamp}@example.local`,
        passwordHash: "test",
        tokenBalance: 0,
        customerMemory: {
          create: {
            needs: "多少钱",
            lastIntent: "PRICE_QUERY",
          },
        },
      },
    });
    createdUserIds.push(low.id);

    async function addConversion(
      userId: string,
      packageId: string,
      status: "SHOWN" | "CLICKED" | "PAID",
    ) {
      const row = await prisma.salesConversion.create({
        data: {
          userId,
          packageId,
          strategy: "MEDIUM",
          status,
        },
        select: { id: true },
      });
      createdConversionIds.push(row.id);
    }

    await addConversion(buyer.id, basic.id, "SHOWN");
    await addConversion(buyer.id, basic.id, "SHOWN");
    await addConversion(buyer.id, basic.id, "CLICKED");
    await addConversion(buyer.id, basic.id, "PAID");
    await addConversion(buyer.id, standard.id, "CLICKED");
    await addConversion(buyer.id, standard.id, "PAID");

    const paidOrder = await prisma.order.create({
      data: {
        userId: buyer.id,
        packageId: basic.id,
        tokenAmount: 10_000,
        amount: 9.9,
        status: OrderStatus.SUCCESS,
      },
    });
    createdOrderIds.push(paidOrder.id);

    for (let i = 0; i < 3; i++) {
      const order = await prisma.order.create({
        data: {
          userId: vip.id,
          packageId: standard.id,
          tokenAmount: 50_000,
          amount: 44,
          status: OrderStatus.SUCCESS,
        },
      });
      createdOrderIds.push(order.id);
    }

    const hvOrder = await prisma.order.create({
      data: {
        userId: highValue.id,
        packageId: basic.id,
        tokenAmount: 10_000,
        amount: 9.9,
        status: OrderStatus.SUCCESS,
      },
    });
    createdOrderIds.push(hvOrder.id);

    const run = await startAgentRun({
      userId: buyer.id,
      serviceType: "SALES",
      intent: "PRICE_QUERY",
    });
    assert(Boolean(run), "agent run");
    createdRunIds.push(run!.id);
    await recordAgentToolCall({
      agentRunId: run!.id,
      toolName: "query_packages",
      arguments: {},
      result: { packages: [{ name: "基础套餐" }] },
      success: true,
      duration: 10,
    });
    await recordAgentToolCall({
      agentRunId: run!.id,
      toolName: "query_balance",
      arguments: {},
      result: { tokenBalance: 18740 },
      success: true,
      duration: 8,
    });
    await recordAgentToolCall({
      agentRunId: run!.id,
      toolName: "query_memory",
      arguments: {},
      result: { customer: { needs: "想买 token" } },
      success: true,
      duration: 8,
    });
    await recordAgentToolCall({
      agentRunId: run!.id,
      toolName: "search_knowledge",
      arguments: { query: "和 Dify 的区别" },
      result: { competitors: [{ name: "Dify" }] },
      success: true,
      duration: 12,
    });
    await finishAgentRun(run!.id, {
      success: true,
      toolsUsed: [
        "query_packages",
        "query_balance",
        "query_memory",
        "search_knowledge",
      ],
      duration: 200,
    });

    const stats = await getSalesAnalyticsStats();

    const basicRow = stats.packages.find((p) => p.packageId === basic.id);
    const standardRow = stats.packages.find((p) => p.packageId === standard.id);
    assert(Boolean(basicRow && standardRow), "package rows");

    assert(basicRow!.shown === 4, `basic shown ${basicRow!.shown}`);
    assert(basicRow!.clicked === 2, `basic clicked ${basicRow!.clicked}`);
    assert(basicRow!.paid === 1, `basic paid ${basicRow!.paid}`);
    assert(basicRow!.paidOrders >= 1, "basic paidOrders");
    assert(standardRow!.shown === 2, `std shown ${standardRow!.shown}`);
    assert(standardRow!.clicked === 2, `std clicked ${standardRow!.clicked}`);
    assert(standardRow!.paid === 1, `std paid ${standardRow!.paid}`);

    assert(stats.funnel.shown >= 6, "funnel shown");
    assert(stats.funnel.clicked >= 4, "funnel clicked");
    assert(stats.funnel.paid >= 2, "funnel paid");
    assert(
      stats.funnel.clickRate ===
        Math.round((stats.funnel.clicked / stats.funnel.shown) * 10000) / 10000,
      "clickRate",
    );
    assert(
      stats.funnel.conversionRate ===
        Math.round((stats.funnel.paid / stats.funnel.shown) * 10000) / 10000,
      "conversionRate",
    );

    const vipLevel = evaluateCustomerLevel({
      tokenBalance: 5000,
      recentOrders: [
        { packageName: "标准套餐", tokenAmount: 50_000 },
        { packageName: "标准套餐", tokenAmount: 50_000 },
        { packageName: "标准套餐", tokenAmount: 50_000 },
      ],
      signals: extractCustomerDemandSignals("公司 50 个人高并发 API"),
      memory: {
        industry: "企业软件",
        needs: "公司 50 个人高并发 API",
        budget: "high",
        painPoints: "",
        purchaseHistory: "",
        recommendedModel: "",
        preferences: "",
        customerStage: "CUSTOMER",
        confidence: "high",
        lastIntent: "ENTERPRISE_PLAN",
      },
      message: "公司 50 个人高并发 API",
      customerType: "ENTERPRISE",
    });
    assert(vipLevel.level === "VIP", "reuse evaluateCustomerLevel VIP");
    assert(stats.customerLevels.VIP >= 1, "VIP count");
    assert(stats.customerLevels.HIGH_VALUE >= 1, "HIGH_VALUE count");
    assert(stats.customerLevels.POTENTIAL >= 1, "POTENTIAL count");
    assert(stats.customerLevels.LOW_VALUE >= 1, "LOW_VALUE count");

    assert(stats.questions.packageQueries >= 1, "package queries");
    assert(stats.questions.balanceQueries >= 1, "balance queries");
    assert(stats.questions.memoryQueries >= 1, "memory queries");
    assert(stats.questions.difyComparisons >= 1, "dify comparisons");
    assert(
      stats.questions.topTools.some((t) => t.name === "query_packages"),
      "tool rank",
    );
    assert(
      !JSON.stringify(stats.questions).includes("sa-buyer-"),
      "no user email in questions",
    );

    const after = await prisma.user.findUnique({
      where: { id: buyer.id },
      select: { tokenBalance: true },
    });
    assert(after?.tokenBalance === beforeBalance, "token not deducted");
    assert(SERVICE_CONFIG.SALES.cost === 0, "SALES still free");

    console.log("OK sales-analytics", {
      funnel: stats.funnel,
      basic: basicRow,
      standard: standardRow,
      customerLevels: stats.customerLevels,
      questions: {
        packageQueries: stats.questions.packageQueries,
        balanceQueries: stats.questions.balanceQueries,
        memoryQueries: stats.questions.memoryQueries,
        difyComparisons: stats.questions.difyComparisons,
        topTools: stats.questions.topTools.slice(0, 4),
      },
      salesCost: SERVICE_CONFIG.SALES.cost,
    });
  } finally {
    await prisma.agentToolCall.deleteMany({
      where: { agentRunId: { in: createdRunIds } },
    });
    await prisma.agentRun.deleteMany({ where: { id: { in: createdRunIds } } });
    await prisma.salesConversion.deleteMany({
      where: { id: { in: createdConversionIds } },
    });
    await prisma.order.deleteMany({ where: { id: { in: createdOrderIds } } });
    await prisma.customerMemory.deleteMany({
      where: { userId: { in: createdUserIds } },
    });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.tokenPackage.deleteMany({
      where: { id: { in: createdPackageIds } },
    });
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
