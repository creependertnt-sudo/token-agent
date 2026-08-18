import { requireAdmin } from "@/lib/admin-auth";
import { errorResponse } from "@/lib/app-error";
import { listTenants } from "@/lib/tenant-context";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAdmin();
    const rows = await listTenants();
    const items = rows.map((row) => ({
      id: row.id,
      name: row.name,
      createdAt: row.createdAt,
      userCount: row._count.users,
      agentCount: row._count.agents,
    }));
    return NextResponse.json({ items });
  } catch (error) {
    return errorResponse(error);
  }
}
