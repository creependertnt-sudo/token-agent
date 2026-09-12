import { randomUUID } from "node:crypto";

export function getVolcConfig() {
  const apiKey = process.env.VOLC_API_KEY?.trim() ?? "";
  const appId = process.env.VOLC_APP_ID?.trim() ?? "";
  const sttResourceId =
    process.env.VOLC_STT_RESOURCE_ID?.trim() || "volc.seedasr.auc";
  const ttsResourceId =
    process.env.VOLC_TTS_RESOURCE_ID?.trim() || "seed-tts-2.0";
  const ttsSpeaker =
    process.env.VOLC_TTS_SPEAKER?.trim() || "zh_female_vv_uranus_bigtts";

  return { apiKey, appId, sttResourceId, ttsResourceId, ttsSpeaker };
}

export function assertVolcConfigured() {
  const config = getVolcConfig();
  if (!config.apiKey) {
    throw new Error("VOLC_API_KEY 未配置，请检查.env.local");
  }
  return config;
}

/** 启动时检查语音环境变量（不阻断文字聊天） */
export function warnIfVolcApiKeyMissing() {
  const apiKey = process.env.VOLC_API_KEY?.trim() ?? "";
  if (!apiKey) {
    console.error("VOLC_API_KEY 未配置，请检查.env.local");
    return false;
  }
  return true;
}

/**
 * 新版控制台：X-Api-Key
 * 旧版控制台：X-Api-App-Key / X-Api-App-Id + X-Api-Access-Key
 * 同时附带两套头，兼容不同控制台凭证。
 */
export function volcAuthHeaders(extra?: Record<string, string>) {
  const { apiKey, appId } = assertVolcConfigured();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Api-Key": apiKey,
    "X-Api-Access-Key": apiKey,
    ...extra,
  };
  if (appId) {
    headers["X-Api-App-Key"] = appId;
    headers["X-Api-App-Id"] = appId;
  }
  return headers;
}

export function mimeToSttFormat(mimeType: string): string {
  const mime = mimeType.toLowerCase().split(";")[0]?.trim() ?? "";
  if (mime.includes("wav")) return "wav";
  if (mime.includes("mpeg") || mime.includes("mp3")) return "mp3";
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("mp4") || mime.includes("m4a")) return "m4a";
  if (mime.includes("webm")) return "webm";
  return "wav";
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 解析 TTS chunked 返回中可能无换行拼接的 JSON 对象 */
function extractJsonObjects(raw: string): Array<Record<string, unknown>> {
  const results: Array<Record<string, unknown>> = [];
  let i = 0;
  while (i < raw.length) {
    while (i < raw.length && /\s/.test(raw[i]!)) i += 1;
    if (i >= raw.length) break;
    if (raw[i] !== "{") {
      i += 1;
      continue;
    }
    let depth = 0;
    let inString = false;
    let escape = false;
    const start = i;
    for (; i < raw.length; i += 1) {
      const c = raw[i]!;
      if (inString) {
        if (escape) escape = false;
        else if (c === "\\") escape = true;
        else if (c === '"') inString = false;
        continue;
      }
      if (c === '"') inString = true;
      else if (c === "{") depth += 1;
      else if (c === "}") {
        depth -= 1;
        if (depth === 0) {
          i += 1;
          try {
            const parsed = JSON.parse(raw.slice(start, i)) as Record<
              string,
              unknown
            >;
            results.push(parsed);
          } catch {
            // skip malformed fragment
          }
          break;
        }
      }
    }
  }
  return results;
}

const STT_SUBMIT =
  "https://openspeech.bytedance.com/api/v3/auc/bigmodel/submit";
const STT_QUERY =
  "https://openspeech.bytedance.com/api/v3/auc/bigmodel/query";
const TTS_URL = "https://openspeech.bytedance.com/api/v3/tts/unidirectional";

const MAX_POLLS = 50;
/** 首轮更快轮询，降低短音频体感延迟 */
const POLL_INTERVAL_MS = 800;

export async function transcribeWithVolc(input: {
  audio: Buffer;
  mimeType: string;
  uid?: string;
}): Promise<string> {
  const { sttResourceId, appId } = assertVolcConfigured();
  const requestId = randomUUID();
  const headers = volcAuthHeaders({
    "X-Api-Resource-Id": sttResourceId,
    "X-Api-Request-Id": requestId,
    "X-Api-Sequence": "-1",
  });

  const submitRes = await fetch(STT_SUBMIT, {
    method: "POST",
    headers,
    body: JSON.stringify({
      user: { uid: input.uid || appId || "token-agent" },
      audio: {
        data: input.audio.toString("base64"),
        format: mimeToSttFormat(input.mimeType),
      },
      request: {
        model_name: "bigmodel",
        enable_itn: true,
        enable_punc: true,
      },
    }),
  });

  const submitStatus = submitRes.headers.get("X-Api-Status-Code") ?? "";
  const submitMsg = submitRes.headers.get("X-Api-Message") ?? "";

  if (
    submitStatus &&
    submitStatus !== "20000000" &&
    submitStatus !== "20000001" &&
    submitStatus !== "20000002"
  ) {
    throw new Error(`豆包 STT 提交失败: ${submitStatus} ${submitMsg}`);
  }

  if (!submitRes.ok && !submitStatus) {
    const errText = await submitRes.text().catch(() => "");
    throw new Error(
      `豆包 STT 提交失败 (${submitRes.status}): ${errText.slice(0, 200)}`,
    );
  }

  // 成功提交通常 body 为 {}，任务 ID 即 X-Api-Request-Id
  await submitRes.text().catch(() => "");

  for (let i = 0; i < MAX_POLLS; i += 1) {
    // 第一次立刻查，后续再间隔；短音频通常 1–2 次即可
    if (i > 0) await sleep(POLL_INTERVAL_MS);
    const queryRes = await fetch(STT_QUERY, {
      method: "POST",
      headers,
      body: "{}",
    });
    const status = queryRes.headers.get("X-Api-Status-Code") ?? "";
    const bodyText = await queryRes.text();

    if (status === "20000001" || status === "20000002") {
      continue;
    }
    if (!bodyText || bodyText === "{}") {
      continue;
    }
    if (status && status !== "20000000") {
      const msg = queryRes.headers.get("X-Api-Message") ?? bodyText.slice(0, 200);
      throw new Error(`豆包 STT 查询失败: ${status} ${msg}`);
    }

    try {
      const parsed = JSON.parse(bodyText) as {
        result?: { text?: string };
      };
      const text = parsed.result?.text?.trim();
      if (text) return text;
    } catch {
      // keep polling
    }
  }

  throw new Error("豆包 STT 超时，未拿到识别结果。");
}

export async function synthesizeWithVolc(input: {
  text: string;
  uid?: string;
}): Promise<Buffer> {
  const { ttsResourceId, ttsSpeaker, appId } = assertVolcConfigured();
  const text = input.text.trim().slice(0, 300);
  if (!text) throw new Error("TTS 文本为空。");

  const headers = volcAuthHeaders({
    "X-Api-Resource-Id": ttsResourceId,
    "X-Api-Request-Id": randomUUID(),
  });

  const response = await fetch(TTS_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({
      user: { uid: input.uid || appId || "token-agent" },
      req_params: {
        text,
        speaker: ttsSpeaker,
        audio_params: {
          format: "mp3",
          sample_rate: 24000,
        },
      },
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(
      `豆包 TTS 失败 (${response.status}): ${errText.slice(0, 240)}`,
    );
  }

  const raw = await response.text();
  const chunks: Buffer[] = [];

  for (const parsed of extractJsonObjects(raw)) {
    const code = typeof parsed.code === "number" ? parsed.code : 0;
    // 0 = 音频分片；20000000 = 合成结束
    if (code === 20000000) continue;
    if (code !== 0) {
      const message =
        typeof parsed.message === "string" ? parsed.message : "";
      throw new Error(`豆包 TTS 返回错误: ${code} ${message}`);
    }
    if (typeof parsed.data === "string" && parsed.data) {
      chunks.push(Buffer.from(parsed.data, "base64"));
    }
  }

  if (chunks.length === 0) {
    throw new Error("豆包 TTS 未返回音频数据。");
  }

  return Buffer.concat(chunks);
}
