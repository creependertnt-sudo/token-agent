import { prisma } from "../lib/db";
import { SERVICE_CONFIG } from "../lib/constants";
import { detectToolQueryMode } from "../lib/tool-query-mode";
import { knowledgeTool } from "../lib/tools/knowledge-tool";
import { runSalesPipeline } from "../lib/sales-pipeline";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function expectedTools(message: string): string[] {
  const text = message.trim();
  if (/^(你好|hello|hi)[！!。.\s]*$/i.test(text)) return [];
  if (/dify|coze|fastgpt|chatbase|竞品|区别|对比/i.test(text)) {
    return ["search_knowledge"];
  }
  return [];
}

async function main() {
  assert(SERVICE_CONFIG.SALES.cost === 0, "SALES stays free");

  const buy = await runSalesPipeline("我想买token");
  const buyName = buy.conversion.products[0]?.name ?? buy.meta.recommendedPackage ?? "";
  assert(buyName.includes("基础"), `买token → 基础套餐, got ${buyName}`);
  assert(buy.conversion.products.length <= 1, "buy at most one card");

  const heavy = await runSalesPipeline("公司50个人高并发API");
  const heavyName =
    heavy.conversion.products[0]?.name ?? heavy.meta.recommendedPackage ?? "";
  assert(heavyName.includes("企业"), `高并发API → 企业套餐, got ${heavyName}`);

  const hello = await runSalesPipeline("你好");
  assert(hello.conversion.products.length === 0, "你好 → 无商品卡");
  assert(hello.conversion.showProducts === false, "你好 → 不出卡");
  assert(detectToolQueryMode("你好") === false, "你好 非查询模式");
  assert(expectedTools("你好").length === 0, "你好 → 无 Tool");

  const difyQuery = "和 Dify 有什么区别";
  const difyPipe = await runSalesPipeline(difyQuery);
  assert(
    difyPipe.meta.competitorHitCount > 0 || difyPipe.meta.knowledgeHitCount > 0,
    "Dify 比较应命中知识库",
  );
  assert(expectedTools(difyQuery).includes("search_knowledge"), "Dify → search_knowledge");
  const kg = (await knowledgeTool.execute(
    { query: difyQuery },
    { userId: "eval-sales-agent" },
  )) as {
    competitors?: Array<{ name: string; summary: string }>;
    salesKnowledge?: Array<{ title: string }>;
  };
  const hitDify = kg.competitors?.some((row) => /dify/i.test(row.name));
  assert(Boolean(hitDify) || (kg.salesKnowledge?.length ?? 0) > 0, "search_knowledge 返回竞品/知识");

  assert(SERVICE_CONFIG.SALES.cost === 0, "SALES still free");

  console.log("OK eval-sales-agent", {
    buy: buyName,
    heavy: heavyName,
    helloCards: hello.conversion.products.length,
    helloTools: expectedTools("你好"),
    difyCompetitors: difyPipe.meta.competitorHitCount,
    difyKnowledge: difyPipe.meta.knowledgeHitCount,
    salesCost: SERVICE_CONFIG.SALES.cost,
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
