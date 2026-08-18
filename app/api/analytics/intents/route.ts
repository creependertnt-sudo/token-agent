import { requireCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * 按 intent 聚合 ChatAnalytics 次数。
 */
export async function GET() {
  const user = await requireCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "请先登录。" }, { status: 401 });
  }

  try {
    const rows = await prisma.chatAnalytics.groupBy({
      by: ["intent"],
      _count: { _all: true },
    });

    const result: Record<string, number> = {};
    for (const row of rows) {
      if (!row.intent) continue;
      result[row.intent] = row._count._all;
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Intent analytics error:", error);
    return NextResponse.json({ error: "读取意图统计失败。" }, { status: 500 });
  }
}
