import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth";
import { transcribeWithVolc } from "@/lib/volc-speech";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const user = await requireCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "请先登录。" }, { status: 401 });
    }

    const contentType = req.headers.get("content-type") ?? "";
    if (!contentType.includes("multipart/form-data")) {
      return NextResponse.json(
        { error: "请以 multipart/form-data 上传 audio 文件。" },
        { status: 400 },
      );
    }

    const form = await req.formData();
    const file = form.get("audio");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "缺少 audio 文件。" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    if (buffer.length < 64) {
      return NextResponse.json({ error: "音频过短，请重新录制。" }, { status: 400 });
    }
    if (buffer.length > 8 * 1024 * 1024) {
      return NextResponse.json({ error: "音频过大，请缩短录音。" }, { status: 400 });
    }

    const text = await transcribeWithVolc({
      audio: buffer,
      mimeType: file.type || "audio/webm",
      uid: user.id,
    });

    return NextResponse.json({ text });
  } catch (error) {
    console.error("[stt]", error);
    const message =
      error instanceof Error ? error.message : "语音识别失败，请稍后重试。";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
