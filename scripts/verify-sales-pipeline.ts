import { analyzeCustomerDemand } from "../lib/customer-analysis";
import { runSalesPipeline } from "../lib/sales-pipeline";

async function main() {
  const a = analyzeCustomerDemand("我是学生，想做翻译和改文案，预算不高");
  if (a.recommendedModel !== "LIGHT") {
    throw new Error(`expected LIGHT got ${a.recommendedModel}`);
  }

  const b = analyzeCustomerDemand("程序员做项目，要数据库设计和普通开发");
  if (b.recommendedModel !== "STANDARD") {
    throw new Error(`expected STANDARD got ${b.recommendedModel}`);
  }

  const c = analyzeCustomerDemand("企业级大型系统架构和复杂算法");
  if (c.recommendedModel !== "PREMIUM") {
    throw new Error(`expected PREMIUM got ${c.recommendedModel}`);
  }

  const pipe = await runSalesPipeline("和 Coze、Dify 有什么区别？");
  if (pipe.meta.intent !== "PRODUCT_COMPARE") {
    throw new Error(`intent ${pipe.meta.intent}`);
  }
  if (!pipe.promptContext.includes("ModelCapability")) {
    throw new Error("missing ModelCapability block");
  }
  if (!pipe.promptContext.includes("CompetitorKnowledge")) {
    throw new Error("missing CompetitorKnowledge block");
  }

  console.log("OK sales pipeline", pipe.meta);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
