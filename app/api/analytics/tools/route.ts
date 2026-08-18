import { requireCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * 按 toolName 聚合 ToolCallLog 调用次数。
 */
export async function GET() {
  const user = await requireCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "请先登录。" }, { status: 401 });
  }

  try {
    const rows = await prisma.toolCallLog.groupBy({
      by: ["toolName"],
      _count: { _all: true },
    });

    const result: Record<string, number> = {};
    for (const row of rows) {
      if (!row.toolName) continue;
      result[row.toolName] = row._count._all;
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Tool analytics error:", error);
    return NextResponse.json({ error: "读取 Tool 统计失败。" }, { status: 500 });
  }
}
