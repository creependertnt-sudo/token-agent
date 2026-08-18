import { runHealthCheck } from "@/lib/health";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const result = await runHealthCheck();
  return NextResponse.json(result, {
    status: result.status === "ok" ? 200 : 503,
  });
}
