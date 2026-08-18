import { requireCurrentUser } from "@/lib/auth";
import { getObservabilityStats } from "@/lib/observability/agent-trace";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * 运营统计：请求数 / Tool 次数 / 销售漏斗 / 错误数。
 * 只读，不参与扣费与推荐。
 */
export async function GET() {
  const user = await requireCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "请先登录。" }, { status: 401 });
  }

  try {
    const stats = await getObservabilityStats();
    return NextResponse.json(stats);
  } catch (error) {
    console.error("Observability stats error:", error);
    return NextResponse.json({ error: "读取观测数据失败。" }, { status: 500 });
  }
}
