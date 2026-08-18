import { MemoryCategory, OrderStatus } from "../app/generated/prisma/enums";
import { prisma } from "../lib/db";
import { SERVICE_CONFIG } from "../lib/constants";
import { agentTools, toOpenAITools } from "../lib/tool-registry";
import { runToolCall, runToolCalls } from "../lib/tool-runner";
import { packageTool } from "../lib/tools/package-tool";
import { balanceTool } from "../lib/tools/balance-tool";
import { orderTool } from "../lib/tools/order-tool";
import { memoryTool } from "../lib/tools/memory-tool";
import { knowledgeTool } from "../lib/tools/knowledge-tool";
import { detectToolQueryMode } from "../lib/tool-query-mode";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

async function main() {
  assert(SERVICE_CONFIG.SALES.cost === 0, "SALES stays free");
  assert(detectToolQueryMode("有什么套餐？") === true, "query: packages");
  assert(detectToolQueryMode("套餐有哪些？") === true, "query: list");
  assert(detectToolQueryMode("价格是多少？") === true, "query: price");
  assert(detectToolQueryMode("余额多少？") === true, "query: balance");
  assert(detectToolQueryMode("我的订单？") === true, "query: orders");
  assert(detectToolQueryMode("我的记录？") === true, "query: records");
  assert(detectToolQueryMode("我想买token") === false, "buy is not query");
  assert(
    detectToolQueryMode("公司50个人高并发API") === false,
    "scene is not query",
  );
  assert(detectToolQueryMode("你好") === false, "hello is not query");
  assert(agentTools.length === 5, "five tools");
  assert(
    agentTools.map((t) => t.name).join(",") ===
      "query_packages,query_balance,query_orders,query_memory,search_knowledge",
    "tool names",
  );

  const openaiTools = toOpenAITools();
  assert(openaiTools.every((t) => t.type === "function"), "openai tools");
  assert(openaiTools[0]?.function.name === "query_packages", "packages schema");

  const unknown = await runToolCall({ name: "not_a_tool" }, { userId: "x" });
  assert(unknown.ok === false, "unknown tool");

  const packages = (await packageTool.execute({}, { userId: "x" })) as {
    packages: Array<{ name: string; tokenAmount: number; price: number; status: string }>;
  };
  assert(packages.packages.length > 0, "packages exist");
  assert(packages.packages.every((p) => p.status === "active"), "active only");

  const testUser = await prisma.user.create({
    data: {
      email: `tool-test-${Date.now()}@example.local`,
      passwordHash: "test",
      tokenBalance: 1234,
      freeChatCount: 7,
    },
    select: { id: true, tokenBalance: true },
  });

  try {
    const pkg = await prisma.tokenPackage.findFirst({
      where: { active: true },
      select: { id: true, tokenAmount: true, price: true },
    });
    if (pkg) {
      await prisma.order.create({
        data: {
          userId: testUser.id,
          packageId: pkg.id,
          tokenAmount: pkg.tokenAmount,
          amount: pkg.price,
          status: OrderStatus.SUCCESS,
        },
      });
    }
    await prisma.agentMemory.create({
      data: {
        userId: testUser.id,
        category: MemoryCategory.business,
        content: "在做企业高并发客服系统",
      },
    });

    const balance = (await balanceTool.execute(
      { userId: "attacker-should-be-ignored" },
      { userId: testUser.id },
    )) as { tokenBalance: number };
    assert(balance.tokenBalance === 1234, "balance uses ctx.userId");

    const orders = (await orderTool.execute({}, { userId: testUser.id })) as {
      orders: Array<{ packageName: string; status: string }>;
    };
    assert(orders.orders.length >= 1, "orders exist");
    assert(orders.orders[0]?.status === "SUCCESS", "order status");

    const memory = (await memoryTool.execute({}, { userId: testUser.id })) as {
      agentMemories: Array<{ content: string }>;
    };
    assert(
      memory.agentMemories.some((m) => m.content.includes("高并发")),
      "memory hit",
    );

    const knowledge = (await knowledgeTool.execute(
      { query: "你们和Dify有什么区别？" },
      { userId: testUser.id },
    )) as {
      competitors: Array<{ name: string; slug: string }>;
      salesKnowledge: unknown[];
    };
    assert(
      knowledge.competitors.some((c) => /dify/i.test(c.slug) || /dify/i.test(c.name)),
      "dify knowledge",
    );

    const ran = await runToolCalls(
      [
        { name: "query_balance", arguments: "{}" },
        { name: "query_packages", arguments: "{}" },
      ],
      { userId: testUser.id },
    );
    assert(ran.length === 2 && ran.every((r) => r.ok), "runner batch");

    console.log("OK agent-tools", {
      packages: packages.packages.length,
      balance: balance.tokenBalance,
      orders: orders.orders.length,
      competitors: knowledge.competitors.map((c) => c.slug),
    });
  } finally {
    await prisma.user.delete({ where: { id: testUser.id } });
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
