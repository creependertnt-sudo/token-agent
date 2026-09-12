import { requireCurrentUser } from "@/lib/auth";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const MAX_EVENTS = 500;

type TrackRecord = {
  id: string;
  event: string;
  data: Record<string, unknown>;
  userId: string | null;
  ts: number;
  at: string;
};

/** 进程内环形缓冲，便于本地看行为路径；重启即清空。 */
const buffer: TrackRecord[] = [];

const ALLOWED = new Set([
  "switch_model",
  "send_message",
  "click_package",
  "click_buy",
  "buy_success",
]);

function push(record: TrackRecord) {
  buffer.push(record);
  if (buffer.length > MAX_EVENTS) {
    buffer.splice(0, buffer.length - MAX_EVENTS);
  }
}

/**
 * POST { event, data?, ts? }
 * 记录一条行为事件。
 */
export async function POST(req: Request) {
  try {
    const user = await requireCurrentUser().catch(() => null);
    const body = await req.json().catch(() => ({}));
    const event = typeof body?.event === "string" ? body.event.trim() : "";
    if (!event || !ALLOWED.has(event)) {
      return NextResponse.json({ error: "无效事件" }, { status: 400 });
    }

    const data =
      body?.data && typeof body.data === "object" && !Array.isArray(body.data)
        ? (body.data as Record<string, unknown>)
        : {};
    const ts =
      typeof body?.ts === "number" && Number.isFinite(body.ts)
        ? body.ts
        : Date.now();

    const record: TrackRecord = {
      id: crypto.randomUUID(),
      event,
      data,
      userId: user?.id ?? null,
      ts,
      at: new Date(ts).toISOString(),
    };

    push(record);
    console.log("[track]", record.event, {
      userId: record.userId,
      ...record.data,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[track] POST error:", error);
    return NextResponse.json({ ok: true }); // 埋点失败不打断客户端
  }
}

/**
 * GET ?limit=50
 * 返回最近事件，用于本地查看转化路径。
 */
export async function GET(req: Request) {
  const user = await requireCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "请先登录。" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const raw = Number(searchParams.get("limit") ?? "50");
  const limit = Number.isFinite(raw)
    ? Math.min(Math.max(Math.floor(raw), 1), MAX_EVENTS)
    : 50;

  const events = buffer.slice(-limit).reverse();
  return NextResponse.json({ count: events.length, events });
}
