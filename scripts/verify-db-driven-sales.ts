import { buildAgentSystemPrompt } from "../lib/agent-router";
import { getModelCapability } from "../lib/model-capability";
import { getModelConfig } from "../lib/model-config";
import { runSalesPipeline } from "../lib/sales-pipeline";

async function main() {
  const p = await runSalesPipeline("A和C有什么区别");
  console.log("compare meta", p.meta);
  console.log(
    "db blocks",
    p.promptContext.includes("ModelConfig"),
    p.promptContext.includes("ModelCapability"),
    p.promptContext.includes("SalesStrategy"),
    p.promptContext.includes("CustomerProfile"),
    p.promptContext.includes("ModelRecommendRule"),
  );

  const p2 = await runSalesPipeline("我是学生预算低只要翻译文案");
  console.log("student", p2.meta.recommended, p2.meta.ruleHit);

  const p3 = await runSalesPipeline(
    "企业要做高并发分布式架构，架构师团队，预算充足",
  );
  console.log("enterprise", p3.meta.recommended, p3.meta.ruleHit);

  const cfg = await getModelConfig("LIGHT");
  const cap = await getModelCapability("LIGHT");
  const sp = buildAgentSystemPrompt({
    serviceType: "LIGHT",
    memories: [],
    tokenBalance: 100,
    modelConfig: cfg,
    modelCapability: cap,
  });
  console.log(
    "no hardcoded A定位",
    !sp.includes("【档位定位·A】"),
    sp.includes("ModelConfig 数据库"),
    sp.includes("systemInstructions") ||
      sp.includes("短答") ||
      Boolean(cfg?.systemInstructions),
  );
  console.log("LIGHT instructions from db:", cfg?.systemInstructions?.slice(0, 40));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
