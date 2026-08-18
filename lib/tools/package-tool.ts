import { listActivePackages } from "@/lib/catalog";
import { EMPTY_OBJECT_SCHEMA, type AgentTool } from "@/lib/tools/types";

export const packageTool: AgentTool = {
  name: "query_packages",
  description:
    "查询当前可购买的 Token 套餐（名称、Token 数量、价格、状态）。用户问「有什么套餐」「套餐多少钱」「价格表」时调用。只负责查数，不要用本工具决定向用户推销哪一档。",
  parameters: EMPTY_OBJECT_SCHEMA,
  async execute() {
    const rows = await listActivePackages();
    return {
      packages: rows.map((p) => ({
        id: p.id,
        name: p.name,
        tokenAmount: p.tokenAmount,
        price: p.price,
        description: p.description,
        status: p.active ? "active" : "inactive",
      })),
    };
  },
};
