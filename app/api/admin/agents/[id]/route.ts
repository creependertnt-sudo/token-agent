import { requireAdmin } from "@/lib/admin-auth";
import { errorResponse } from "@/lib/app-error";
import { updateAgentConfig } from "@/lib/agent-config";
import { getCurrentTenant } from "@/lib/tenant-context";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const admin = await requireAdmin();
    const tenant = await getCurrentTenant();
    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const item = await updateAgentConfig(
      id,
      {
        systemPrompt:
          typeof body.systemPrompt === "string" ? body.systemPrompt : undefined,
        temperature:
          typeof body.temperature === "number"
            ? body.temperature
            : typeof body.temperature === "string" &&
                body.temperature.trim() !== ""
              ? Number(body.temperature)
              : undefined,
        enabled: typeof body.enabled === "boolean" ? body.enabled : undefined,
        model: typeof body.model === "string" ? body.model : undefined,
        name: typeof body.name === "string" ? body.name : undefined,
      },
      admin.email,
      tenant?.id,
    );
    return NextResponse.json({ item });
  } catch (error) {
    return errorResponse(error);
  }
}
