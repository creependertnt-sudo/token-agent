import { requireAdmin } from "@/lib/admin-auth";
import { errorResponse } from "@/lib/app-error";
import { createKnowledge, listKnowledge } from "@/lib/knowledge-admin";
import { getCurrentTenant } from "@/lib/tenant-context";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await requireAdmin();
    const tenant = await getCurrentTenant();
    const q = new URL(req.url).searchParams.get("q") ?? "";
    const items = await listKnowledge(q, tenant?.id);
    return NextResponse.json({ items });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(req: Request) {
  try {
    await requireAdmin();
    const tenant = await getCurrentTenant();
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const item = await createKnowledge({
      type: typeof body.type === "string" ? body.type : undefined,
      title: typeof body.title === "string" ? body.title : undefined,
      name: typeof body.name === "string" ? body.name : undefined,
      category: typeof body.category === "string" ? body.category : undefined,
      content: typeof body.content === "string" ? body.content : undefined,
      keywords: typeof body.keywords === "string" ? body.keywords : undefined,
      slug: typeof body.slug === "string" ? body.slug : undefined,
      strengths: typeof body.strengths === "string" ? body.strengths : undefined,
      differences:
        typeof body.differences === "string" ? body.differences : undefined,
      talkTrack: typeof body.talkTrack === "string" ? body.talkTrack : undefined,
    }, tenant?.id);
    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
