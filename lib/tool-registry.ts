import { balanceTool } from "@/lib/tools/balance-tool";
import { knowledgeTool } from "@/lib/tools/knowledge-tool";
import { memoryTool } from "@/lib/tools/memory-tool";
import { orderTool } from "@/lib/tools/order-tool";
import { packageTool } from "@/lib/tools/package-tool";
import type { AgentTool } from "@/lib/tools/types";

export const agentTools: AgentTool[] = [
  packageTool,
  balanceTool,
  orderTool,
  memoryTool,
  knowledgeTool,
];

export const agentToolMap = new Map(
  agentTools.map((tool) => [tool.name, tool]),
);

export function toOpenAITools(tools: AgentTool[] = agentTools) {
  return tools.map((tool) => ({
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
}

/** 注入 system prompt：何时调用工具。不改变模型身份行。 */
export const TOOL_USAGE_GUIDE = `【业务工具】
需要实时数据库数据时调用工具，禁止编造余额、订单、套餐价格或竞品资料。
- 问余额 → query_balance
- 问有哪些套餐 / 价格表 → query_packages
- 问买过什么 / 订单 → query_orders
- 问是否记得用户项目 / 偏好 → query_memory
- 问产品介绍、和 Dify/Coze 等区别 → search_knowledge
打招呼、闲聊不要调用任何工具。
工具只负责「查什么」；「卖什么」和商品卡由销售决策系统决定。
纯查询（有什么套餐 / 价格表 / 余额 / 订单）必须完整展示工具返回的全部事实，禁止只用推荐档替代查询结果。
购买或场景咨询时仍可调用 query_packages 核对数字，但正文只围绕最终推荐套餐，不要把三档目录整页列出。`;
