import { requireAdmin } from "@/lib/admin-auth";
import { AppError, errorResponse } from "@/lib/app-error";
import {
  createAgentFeedback,
  getEvaluationStats,
} from "@/lib/agent-evaluation";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAdmin();
    const stats = await getEvaluationStats();
    return NextResponse.json(stats);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(req: Request) {
  try {
    await requireAdmin();
    const body = (await req.json().catch(() => ({}))) as {
      agentRunId?: string;
      rating?: number;
      comment?: string;
    };
    const agentRunId =
      typeof body.agentRunId === "string" ? body.agentRunId.trim() : "";
    if (!agentRunId) {
      throw new AppError("BAD_REQUEST", "缺少 agentRunId。", 400);
    }
    const item = await createAgentFeedback({
      agentRunId,
      rating: Number(body.rating),
      comment: typeof body.comment === "string" ? body.comment : null,
    });
    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
