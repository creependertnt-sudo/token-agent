import {
  formatSalesKnowledgeForPrompt,
  searchSalesKnowledge,
} from "../lib/sales-knowledge";
import { buildAgentSystemPrompt } from "../lib/agent-router";

async function main() {
  const hits = await searchSalesKnowledge({
    query: "哪个模型适合我做网站开发",
    limit: 5,
  });
  console.log(
    "hits:",
    hits.map((h) => `${h.category}:${h.title}:${h.score}`),
  );
  if (hits.length === 0) throw new Error("expected knowledge hits");

  const prompt = buildAgentSystemPrompt({
    serviceType: "SALES",
    memories: [],
    tokenBalance: 0,
    salesCatalog: {
      packagesText: "- 基础套餐",
      modelsText: "- demo",
      showProducts: false,
    },
    salesKnowledgeText: formatSalesKnowledgeForPrompt(hits),
  });
  if (!prompt.includes("销售知识库检索结果")) throw new Error("missing rag block");
  if (!prompt.includes(hits[0].title)) throw new Error("missing hit title");
  console.log("OK rag inject");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
