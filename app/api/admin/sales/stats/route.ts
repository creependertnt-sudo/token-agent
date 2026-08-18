import { requireAdmin } from "@/lib/admin-auth";
import { errorResponse } from "@/lib/app-error";
import { getSalesAnalyticsStats } from "@/lib/sales-analytics";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAdmin();
    const stats = await getSalesAnalyticsStats();
    return NextResponse.json(stats);
  } catch (error) {
    return errorResponse(error);
  }
}
