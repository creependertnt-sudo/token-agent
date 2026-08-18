import { requireCurrentUser } from "@/lib/auth";
import { getAdminAgentStats } from "@/lib/agent-observability/stats";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await requireCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "请先登录。" }, { status: 401 });
  }

  try {
    const stats = await getAdminAgentStats();
    return NextResponse.json(stats);
  } catch (error) {
    console.error("Admin agent stats error:", error);
    return NextResponse.json({ error: "读取 Agent 统计失败。" }, { status: 500 });
  }
}
