import { searchCompetitorKnowledge } from "@/lib/competitor-knowledge";
import { searchSalesKnowledge } from "@/lib/sales-knowledge";
import type { AgentTool } from "@/lib/tools/types";

function asQuery(args: Record<string, unknown>): string {
  const q = args.query;
  return typeof q === "string" ? q.trim() : "";
}

export const knowledgeTool: AgentTool = {
  name: "search_knowledge",
  description:
    "检索销售知识库与竞品知识库（SalesKnowledge、CompetitorKnowledge）。用户问产品介绍、和 Dify/Coze/FastGPT/Chatbase 的区别、FAQ 时调用。参数 query 为检索语句。",
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "检索关键词，例如「和 Dify 的区别」「套餐介绍」",
      },
    },
    required: ["query"],
    additionalProperties: false,
  },
  async execute(args) {
    const query = asQuery(args);
    if (!query) {
      return { error: "query_required" };
    }
    const [sales, competitors] = await Promise.all([
      searchSalesKnowledge({ query, limit: 5 }),
      searchCompetitorKnowledge({ query, limit: 4 }),
    ]);
    return {
      salesKnowledge: sales.map((h) => ({
        category: h.category,
        title: h.title,
        content: h.content,
        score: h.score,
      })),
      competitors: competitors.map((h) => ({
        name: h.name,
        slug: h.slug,
        summary: h.summary,
        differences: h.differences,
        talkTrack: h.talkTrack,
        score: h.score,
      })),
    };
  },
};
