import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth";
import { synthesizeWithVolc } from "@/lib/volc-speech";
import { prepareVoiceText } from "@/lib/voice-naturalizer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const user = await requireCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "请先登录。" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      text?: unknown;
      serviceType?: unknown;
    };
    const raw = typeof body.text === "string" ? body.text.trim() : "";
    const serviceType =
      typeof body.serviceType === "string" ? body.serviceType : undefined;

    console.log("[RAW TTS INPUT]", raw);

    if (!raw.trim()) {
      console.log("[VOICE EMPTY SKIP]", raw);
      return NextResponse.json({ error: "empty voice text" }, { status: 400 });
    }

    // 双保险：清洗 + 自然化后再送豆包
    const text = prepareVoiceText(raw, { serviceType });
    if (!text?.trim()) {
      console.log("[VOICE EMPTY SKIP]", raw);
      return NextResponse.json({ error: "empty voice text" }, { status: 400 });
    }

    console.log("[FINAL TTS TEXT]", text);

    const audio = await synthesizeWithVolc({
      text,
      uid: user.id,
    });

    return new NextResponse(new Uint8Array(audio), {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[tts]", error);
    const message =
      error instanceof Error ? error.message : "语音合成失败，请稍后重试。";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
