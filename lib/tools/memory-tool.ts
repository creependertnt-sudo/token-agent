import { getCustomerMemory } from "@/lib/customer-memory";
import { getUserMemories, selectImportantMemories } from "@/lib/memory";
import { EMPTY_OBJECT_SCHEMA, type AgentTool } from "@/lib/tools/types";

export const memoryTool: AgentTool = {
  name: "query_memory",
  description:
    "查询当前用户的长期记忆：CustomerMemory（行业/需求/预算/阶段）与 AgentMemory（偏好与事实）。用户问「你还记得我的项目吗」「我之前说过什么需求」时调用。",
  parameters: EMPTY_OBJECT_SCHEMA,
  async execute(_args, ctx) {
    const [customer, agent] = await Promise.all([
      getCustomerMemory(ctx.userId),
      getUserMemories(ctx.userId),
    ]);
    const important = selectImportantMemories(agent, 20);
    return {
      customerMemory: customer
        ? {
            industry: customer.industry,
            needs: customer.needs,
            budget: customer.budget,
            painPoints: customer.painPoints,
            purchaseHistory: customer.purchaseHistory,
            recommendedModel: customer.recommendedModel,
            preferences: customer.preferences,
            customerStage: customer.customerStage,
            lastIntent: customer.lastIntent,
          }
        : null,
      agentMemories: important.map((m) => ({
        category: m.category,
        content: m.content,
      })),
    };
  },
};
