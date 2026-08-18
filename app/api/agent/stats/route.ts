import { requireCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * AgentLog 总览：请求量、Tool 使用、成交率。
 */
export async function GET() {
  const user = await requireCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "请先登录。" }, { status: 401 });
  }

  try {
    const total = await prisma.agentLog.count();

    const toolUsage = await prisma.agentLog.groupBy({
      by: ["toolUsed"],
      _count: { _all: true },
    });

    const conversion = await prisma.agentLog.count({
      where: { purchased: true },
    });

    return NextResponse.json({
      total,
      toolUsage,
      conversionRate: total === 0 ? 0 : conversion / total,
    });
  } catch (error) {
    console.error("Agent stats error:", error);
    return NextResponse.json({ error: "读取 Agent 统计失败。" }, { status: 500 });
  }
}
