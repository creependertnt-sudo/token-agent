import { requireCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type ConversionCounts = {
  shown: number;
  clicked: number;
  paid: number;
};

function emptyCounts(): ConversionCounts {
  return { shown: 0, clicked: 0, paid: 0 };
}

function actionKey(action: string): keyof ConversionCounts | null {
  const normalized = action.trim().toUpperCase();
  if (normalized === "SHOWN") return "shown";
  if (normalized === "CLICKED") return "clicked";
  if (normalized === "PAID") return "paid";
  return null;
}

/**
 * 按套餐聚合 ConversionAnalytics：展示 / 点击 / 成交次数。
 */
export async function GET() {
  const user = await requireCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "请先登录。" }, { status: 401 });
  }

  try {
    const rows = await prisma.conversionAnalytics.groupBy({
      by: ["packageId", "action"],
      _count: { _all: true },
    });

    const result: Record<string, ConversionCounts> = {};
    for (const row of rows) {
      const key = actionKey(row.action);
      if (!key) continue;
      const current = result[row.packageId] ?? emptyCounts();
      current[key] = row._count._all;
      result[row.packageId] = current;
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Conversion analytics error:", error);
    return NextResponse.json({ error: "读取转化统计失败。" }, { status: 500 });
  }
}
