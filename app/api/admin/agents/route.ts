import { requireAdmin } from "@/lib/admin-auth";
import { errorResponse } from "@/lib/app-error";
import { listAgentConfigs } from "@/lib/agent-config";
import { getCurrentTenant } from "@/lib/tenant-context";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAdmin();
    const tenant = await getCurrentTenant();
    const items = await listAgentConfigs(tenant?.id);
    return NextResponse.json({ items });
  } catch (error) {
    return errorResponse(error);
  }
}
