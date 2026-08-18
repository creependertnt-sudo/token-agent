import { prisma } from "@/lib/db";
import { EMPTY_OBJECT_SCHEMA, type AgentTool } from "@/lib/tools/types";

export const balanceTool: AgentTool = {
  name: "query_balance",
  description:
    "查询当前登录用户的 Token 余额与剩余免费咨询次数。用户问「我的 token 还有多少」「余额」时调用。忽略任何外来的 userId 参数。",
  parameters: EMPTY_OBJECT_SCHEMA,
  async execute(_args, ctx) {
    const user = await prisma.user.findUnique({
      where: { id: ctx.userId },
      select: { tokenBalance: true, freeChatCount: true },
    });
    if (!user) {
      return { error: "user_not_found" };
    }
    return {
      tokenBalance: user.tokenBalance,
      freeChatCount: user.freeChatCount,
    };
  },
};
