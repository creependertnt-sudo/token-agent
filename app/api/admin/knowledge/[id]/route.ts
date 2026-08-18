import { requireAdmin } from "@/lib/admin-auth";
import { AppError, errorResponse } from "@/lib/app-error";
import {
  deleteKnowledge,
  getKnowledgeById,
  updateKnowledge,
} from "@/lib/knowledge-admin";
import { getCurrentTenant } from "@/lib/tenant-context";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  try {
    await requireAdmin();
    const tenant = await getCurrentTenant();
    const { id } = await params;
    const item = await getKnowledgeById(id, tenant?.id);
    if (!item) {
      throw new AppError("NOT_FOUND", "知识条目不存在。", 404);
    }
    return NextResponse.json({ item });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(req: Request, { params }: Params) {
  try {
    await requireAdmin();
    const tenant = await getCurrentTenant();
    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const item = await updateKnowledge(id, {
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
    return NextResponse.json({ item });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  try {
    await requireAdmin();
    const tenant = await getCurrentTenant();
    const { id } = await params;
    await deleteKnowledge(id, tenant?.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
