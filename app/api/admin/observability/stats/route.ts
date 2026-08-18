import { requireAdmin } from "@/lib/admin-auth";
import { errorResponse } from "@/lib/app-error";
import { getObservabilityStats } from "@/lib/observability/agent-trace";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAdmin();
    const stats = await getObservabilityStats();
    return NextResponse.json(stats);
  } catch (error) {
    return errorResponse(error);
  }
}
