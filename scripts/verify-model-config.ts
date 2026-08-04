import { buildAgentSystemPrompt } from "../lib/agent-router";
import {
  getModelConfig,
  isModelCompareQuestion,
  parseComparedGrades,
} from "../lib/model-config";
import { runSalesPipeline } from "../lib/sales-pipeline";

async function main() {
  const q = "A和C有什么区别";
  console.log("compare?", isModelCompareQuestion(q), parseComparedGrades(q));

  const p = await runSalesPipeline(q);
  console.log("meta", p.meta);
  console.log("has ModelConfig compare", p.promptContext.includes("来源 ModelConfig"));
  console.log("has A档", p.promptContext.includes("A档"));
  console.log("has C档", p.promptContext.includes("C档"));
  console.log("snippet:\n", p.promptContext.slice(0, 800));

  const cfg = await getModelConfig("LIGHT");
  const sp = buildAgentSystemPrompt({
    serviceType: "LIGHT",
    memories: [],
    tokenBalance: 100,
    modelConfig: cfg,
  });
  console.log("LIGHT 快速", sp.includes("快速"));
  console.log("LIGHT ModelConfig", sp.includes("ModelConfig 数据库配置"));

  const p2 = await runSalesPipeline("我是学生预算低只要翻译文案");
  console.log("recommend student", p2.meta.recommended, p2.meta.budget);

  const p3 = await runSalesPipeline(
    "我们是互联网创业团队，要做后台系统和数据库，中等预算",
  );
  console.log(
    "recommend startup",
    p3.meta.recommended,
    p3.meta.industry,
    p3.meta.techLevel,
  );

  const p4 = await runSalesPipeline(
    "企业要做高并发分布式架构，架构师团队，预算充足",
  );
  console.log("recommend enterprise", p4.meta.recommended, p4.meta.techLevel);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
