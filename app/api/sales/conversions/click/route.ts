import { requireCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { markSalesConversionClicked } from "@/lib/sales-conversion-log";
import { NextResponse } from "next/server";

/**
 * 用户点击商品卡或带着推荐套餐进入充值页。
 */
export async function POST(req: Request) {
  try {
    const user = await requireCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "请先登录。" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const conversionId =
      typeof body?.conversionId === "string" ? body.conversionId.trim() : "";
    const packageId =
      typeof body?.packageId === "string" ? body.packageId.trim() : "";

    const row = await markSalesConversionClicked({
      userId: user.id,
      conversionId: conversionId || null,
      packageId: packageId || null,
    });

    const analyticsPackageId = packageId || row?.packageId;
    if (analyticsPackageId) {
      void prisma.conversionAnalytics
        .create({
          data: {
            packageId: analyticsPackageId,
            action: "CLICKED",
          },
        })
        .catch((error) => {
          console.error("[conversion-analytics]", error);
        });
    }

    return NextResponse.json({ ok: true, conversionId: row?.id ?? null });
  } catch (error) {
    console.error("Sales conversion click error:", error);
    return NextResponse.json({ error: "记录点击失败。" }, { status: 500 });
  }
}
