import { prisma } from "@/lib/db";
import { EMPTY_OBJECT_SCHEMA, type AgentTool } from "@/lib/tools/types";

export const orderTool: AgentTool = {
  name: "query_orders",
  description:
    "查询当前登录用户的历史订单（套餐、Token 数量、金额、状态、时间）。用户问「我之前买过什么」「订单记录」时调用。",
  parameters: EMPTY_OBJECT_SCHEMA,
  async execute(_args, ctx) {
    const rows = await prisma.order.findMany({
      where: { userId: ctx.userId },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        tokenAmount: true,
        amount: true,
        status: true,
        createdAt: true,
        package: { select: { name: true, tokenAmount: true } },
      },
    });
    return {
      orders: rows.map((o) => ({
        id: o.id,
        packageName: o.package?.name ?? "未知套餐",
        tokenAmount: o.tokenAmount,
        amount: o.amount,
        status: o.status,
        createdAt: o.createdAt.toISOString(),
      })),
    };
  },
};
