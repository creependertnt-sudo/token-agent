import { authFetch } from "@/lib/client-auth";
import {
  prepareVoiceText,
  type VoiceNaturalizeOptions,
} from "@/lib/voice-naturalizer";
import { cleanVoiceText } from "@/lib/voice-text-cleaner";

/** 当前 TTS 自然化上下文（如 SALES） */
let ttsNaturalizeOptions: VoiceNaturalizeOptions = {};

export function setTtsNaturalizeOptions(options: VoiceNaturalizeOptions) {
  ttsNaturalizeOptions = {
    serviceType: options.serviceType ?? undefined,
  };
}

function prepareForTts(raw: string): string | null {
  const text = prepareVoiceText(raw, ttsNaturalizeOptions);
  if (!text) {
    console.log("[VOICE SKIP EMPTY]", raw);
    return null;
  }
  const sliced = text.slice(0, HARD_MAX).trim();
  if (!sliced) {
    console.log("[VOICE SKIP EMPTY]", raw);
    return null;
  }
  return sliced;
}

/** 清洗口语语气词，避免「嗯啊」直接进对话 */
export function cleanText(text: string) {
  return text.replace(/[嗯啊哦]/g, "").trim();
}

export type VoiceStatus =
  | "idle"
  | "recording"
  | "recognizing"
  | "thinking"
  | "speaking";

const MAX_RECORD_MS = 30_000;

/** 智能分段：短句合并，目标 20~80 字 */
const HOLD_BELOW = 15;
const TARGET_MIN = 20;
const SOFT_MAX = 80;
const HARD_MAX = 160;
const MAX_WAIT_MS = 1500;
const SENTENCE_ENDERS = "。！？!?；;\n";
const PREFETCH_AHEAD = 2;

/** 防止短时间内重复触发识别 */
let isProcessing = false;

let mediaRecorder: MediaRecorder | null = null;
let mediaStream: MediaStream | null = null;
let audioChunks: Blob[] = [];
let currentAudio: HTMLAudioElement | null = null;
let recordStartedAt = 0;
let maxRecordTimer: ReturnType<typeof setTimeout> | null = null;
let onMaxRecord: (() => void) | null = null;

type TtsQueueItem = {
  text: string;
  status: "pending" | "loading" | "ready" | "error";
  url?: string;
  loadPromise?: Promise<void>;
};

/** 文本队列 + 预生成音频，播放时下一段已就绪 */
let ttsQueue: TtsQueueItem[] = [];
let playRunning = false;
let drainToken = 0;
/** 播放锁：同一时刻只允许一轮 TTS */
let ttsActive = false;
let onTtsSpeaking: (() => void) | null = null;
let onTtsIdle: (() => void) | null = null;

export type TtsStreamState = {
  cursor: number;
  /** 已切出但未达播放长度的短句缓冲 */
  pending: string;
  emitted: number;
  /** 当前缓冲开始等待的时间戳 */
  waitStartedAt: number | null;
};

export function createTtsStreamState(): TtsStreamState {
  return { cursor: 0, pending: "", emitted: 0, waitStartedAt: null };
}

/** 流式 TTS 缓冲：先攒完整 Markdown，再清洗入队 */
export type VoiceTextBuffer = {
  cursor: number;
  waitStartedAt: number | null;
  emitted: number;
};

export function createVoiceTextBuffer(): VoiceTextBuffer {
  return { cursor: 0, waitStartedAt: null, emitted: 0 };
}

/** ASCII 方括号 / 圆括号是否成对（忽略中文（）） */
export function isMarkdownStructureBalanced(text: string): boolean {
  let square = 0;
  let paren = 0;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]!;
    if (ch === "[") square += 1;
    else if (ch === "]") square -= 1;
    else if (ch === "(") paren += 1;
    else if (ch === ")") paren -= 1;
    if (square < 0 || paren < 0) return false;
  }
  return square === 0 && paren === 0;
}

const BUFFER_ENDERS = "。！？!?；;\n";

/**
 * 在未闭合 Markdown 时不切分；找到第一个「结构完整」的安全切点（尽早开播）。
 * 切点：句末标点 / 换行 / 链接闭合 `)`
 */
function findSafeVoiceCut(text: string): number {
  let bestShort = -1;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]!;
    const isEnder = BUFFER_ENDERS.includes(ch);
    const isLinkClose = ch === ")";
    if (!isEnder && !isLinkClose) continue;

    const candidate = text.slice(0, i + 1);
    if (!isMarkdownStructureBalanced(candidate)) continue;

    const trimmedLen = candidate.trim().length;
    // 完整 Markdown 链接闭合后立刻可切
    if (isLinkClose && trimmedLen >= 1) return i + 1;
    // 完整句子达目标长度立刻切
    if (isEnder && trimmedLen >= TARGET_MIN) return i + 1;
    // 稍短但完整的句子先记着，继续看有没有更合适的
    if (isEnder && trimmedLen >= HOLD_BELOW) bestShort = i + 1;
  }
  return bestShort;
}

/**
 * 将 AI 累计全文同步进缓冲，仅放出 Markdown 完整的安全片段。
 * 返回值已 prepareVoiceText，可直接入 TTS 队列。
 */
export function drainVoiceTextBuffer(
  buffer: VoiceTextBuffer,
  fullText: string,
  flush: boolean,
  now = Date.now(),
): string[] {
  const ready: string[] = [];
  if (!fullText) return ready;

  console.log("[VOICE BUFFER]");
  console.log("原始累计文本");
  console.log(fullText);

  if (buffer.waitStartedAt == null && fullText.length > buffer.cursor) {
    buffer.waitStartedAt = now;
  }

  let guard = 0;
  while (guard++ < 50) {
    const remaining = fullText.slice(buffer.cursor);
    if (!remaining.trim()) {
      buffer.cursor = fullText.length;
      break;
    }

    const cut = findSafeVoiceCut(remaining);
    if (cut > 0) {
      const rawPiece = remaining.slice(0, cut);
      console.log("[VOICE READY]");
      console.log("准备进入TTS文本");
      console.log(rawPiece);

      const finalText = prepareForTts(rawPiece);
      console.log("[VOICE FINAL]");
      console.log("最终发送豆包文本");
      console.log(finalText);

      if (finalText) {
        ready.push(finalText);
        buffer.emitted += 1;
      }
      buffer.cursor += cut;
      buffer.waitStartedAt = now;
      continue;
    }

    // 无安全切点：未闭合 Markdown 则继续等下一 chunk
    if (!isMarkdownStructureBalanced(remaining)) {
      console.log("[VOICE BUFFER] Markdown 未闭合，继续等待下一 chunk");
      if (flush) {
        // 流已结束，强制处理剩余（避免永久卡住）
        console.log("[VOICE READY]");
        console.log("准备进入TTS文本");
        console.log(remaining);
        const finalText = prepareForTts(remaining);
        console.log("[VOICE FINAL]");
        console.log("最终发送豆包文本");
        console.log(finalText);
        if (finalText) ready.push(finalText);
        buffer.cursor = fullText.length;
        buffer.waitStartedAt = null;
      }
      break;
    }

    // 已平衡但无句号：超时或 flush 时放出
    const waited =
      buffer.waitStartedAt != null ? now - buffer.waitStartedAt : 0;
    if (flush || (waited >= MAX_WAIT_MS && remaining.trim().length >= HOLD_BELOW)) {
      console.log("[VOICE READY]");
      console.log("准备进入TTS文本");
      console.log(remaining);
      const finalText = prepareForTts(remaining);
      console.log("[VOICE FINAL]");
      console.log("最终发送豆包文本");
      console.log(finalText);
      if (finalText) ready.push(finalText);
      buffer.cursor = fullText.length;
      buffer.waitStartedAt = null;
    }
    break;
  }

  return ready;
}

/** 入队已 prepare 过的文本（不再二次清洗） */
export function enqueuePreparedTtsTexts(texts: string[]) {
  for (const raw of texts) {
    const text = raw.trim().slice(0, HARD_MAX);
    if (!text) {
      console.log("[VOICE SKIP EMPTY]", raw);
      continue;
    }
    ttsQueue.push({ text, status: "pending" });
  }
  if (!ttsActive) ttsActive = true;
  prefetchAhead();
  void pumpPlayback();
}

/**
 * 开始新一轮 TTS：若已有播放则先打断，再上锁。
 * 同一轮内多次 enqueue 不要重复调用。
 */
export function beginTtsPlayback() {
  if (ttsActive || playRunning || Boolean(currentAudio && !currentAudio.paused)) {
    clearTtsQueue();
  }
  ttsActive = true;
}

export function setTtsLifecycleHandlers(handlers: {
  onSpeaking?: (() => void) | null;
  onIdle?: (() => void) | null;
}) {
  onTtsSpeaking = handlers.onSpeaking ?? null;
  onTtsIdle = handlers.onIdle ?? null;
}

function pickMimeType(): string {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/mp4",
  ];
  for (const type of candidates) {
    if (
      typeof MediaRecorder !== "undefined" &&
      MediaRecorder.isTypeSupported(type)
    ) {
      return type;
    }
  }
  return "";
}

function stopTracks() {
  mediaStream?.getTracks().forEach((track) => track.stop());
  mediaStream = null;
}

function clearMaxRecordTimer() {
  if (maxRecordTimer) {
    clearTimeout(maxRecordTimer);
    maxRecordTimer = null;
  }
  onMaxRecord = null;
}

function stopCurrentAudio() {
  if (currentAudio) {
    currentAudio.pause();
    try {
      URL.revokeObjectURL(currentAudio.src);
    } catch {
      // ignore
    }
    currentAudio = null;
  }
}

export function isTtsPlaying(): boolean {
  return (
    ttsActive ||
    playRunning ||
    Boolean(currentAudio && !currentAudio.paused)
  );
}

export function getTtsQueueLength(): number {
  return ttsQueue.length + (playRunning ? 1 : 0);
}

function markWait(state: TtsStreamState) {
  if (state.waitStartedAt == null) state.waitStartedAt = Date.now();
}

function clearWait(state: TtsStreamState) {
  state.waitStartedAt = null;
}

function normalizeSegment(text: string): string {
  // 分段长度按清洗后文本估算（自然化可能改变长度，仅作阈值）
  return cleanVoiceText(text).replace(/\s+/g, "").trim();
}

/**
 * 智能分段：
 * - <15 字不立刻放出，与后文合并
 * - 优先 20~80 字一段
 * - 超过 1.5s 无句号也强制放出缓冲（减少干等）
 */
export function advanceTtsStream(
  state: TtsStreamState,
  fullText: string,
  flush: boolean,
  now = Date.now(),
): string[] {
  const out: string[] = [];
  let i = Math.max(state.cursor, 0);

  const emit = (raw: string) => {
    // 入队前走完整 TTS 处理链（清洗 + 自然化）
    const text = prepareForTts(raw);
    if (!text) return;
    out.push(text);
    state.emitted += 1;
    clearWait(state);
  };

  const tryRelease = (force: boolean) => {
    const bucket = state.pending.trim();
    if (!bucket) return;

    if (!force) {
      if (bucket.length < HOLD_BELOW) return;
      if (bucket.length < TARGET_MIN) return;
    }

    // 过长时尽量在句末切开，目标落在 20~80
    if (bucket.length > SOFT_MAX) {
      let cut = -1;
      for (let k = Math.min(SOFT_MAX, bucket.length) - 1; k >= TARGET_MIN; k -= 1) {
        if (SENTENCE_ENDERS.includes(bucket[k]!)) {
          cut = k + 1;
          break;
        }
      }
      if (cut < 0) cut = Math.min(SOFT_MAX, bucket.length);
      emit(bucket.slice(0, cut));
      state.pending = bucket.slice(cut).trim();
      if (state.pending) markWait(state);
      return;
    }

    emit(bucket);
    state.pending = "";
  };

  while (i < fullText.length) {
    let j = i;
    while (j < fullText.length && !SENTENCE_ENDERS.includes(fullText[j]!)) {
      j += 1;
    }
    if (j >= fullText.length) break;

    j += 1;
    const raw = fullText.slice(i, j);
    i = j;
    state.cursor = i;

    state.pending = `${state.pending}${raw}`;
    markWait(state);

    if (normalizeSegment(state.pending).length < HOLD_BELOW) {
      continue;
    }
    tryRelease(false);
    while (normalizeSegment(state.pending).length > SOFT_MAX) {
      tryRelease(true);
    }
  }

  const unfinished = fullText.slice(state.cursor);
  if (state.pending.trim() || unfinished) {
    markWait(state);
  }

  const waited =
    state.waitStartedAt != null ? now - state.waitStartedAt : 0;
  const timedOut = !flush && waited >= MAX_WAIT_MS;

  if (flush || timedOut) {
    if (unfinished) {
      state.pending = `${state.pending}${unfinished}`;
      state.cursor = fullText.length;
    }
    if (state.pending.trim()) {
      tryRelease(true);
      while (normalizeSegment(state.pending).length > SOFT_MAX) {
        tryRelease(true);
      }
      // 流结束：残余短句也播掉，避免吞字
      if (flush && state.pending.trim()) {
        emit(state.pending);
        state.pending = "";
      }
      // 超时：至少 HOLD_BELOW 才强行播，避免碎音
      if (
        timedOut &&
        !flush &&
        normalizeSegment(state.pending).length >= HOLD_BELOW
      ) {
        emit(state.pending);
        state.pending = "";
      }
    }
  }

  return out;
}

function revokeItemUrl(item: TtsQueueItem) {
  if (item.url) {
    try {
      URL.revokeObjectURL(item.url);
    } catch {
      // ignore
    }
    item.url = undefined;
  }
}

/** 清空队列并停止当前播放（打断用） */
export function clearTtsQueue() {
  drainToken += 1;
  playRunning = false;
  ttsActive = false;
  for (const item of ttsQueue) revokeItemUrl(item);
  ttsQueue = [];
  stopCurrentAudio();
  onTtsIdle?.();
}

/** 入队文本，并立刻后台预生成音频（不等待上一段播完） */
export function enqueueTtsSentences(sentences: string[]) {
  for (const raw of sentences) {
    const text = prepareForTts(raw);
    if (!text) continue;
    ttsQueue.push({ text, status: "pending" });
  }
  if (!ttsActive) ttsActive = true;
  prefetchAhead();
  void pumpPlayback();
}

function prefetchAhead() {
  let started = 0;
  for (const item of ttsQueue) {
    if (started >= PREFETCH_AHEAD) break;
    if (item.status === "ready" || item.status === "error") {
      started += 1;
      continue;
    }
    void ensureItemReady(item);
    started += 1;
  }
}

function ensureItemReady(item: TtsQueueItem): Promise<void> {
  if (item.status === "ready") return Promise.resolve();
  if (item.status === "error") return Promise.resolve();
  if (item.loadPromise) return item.loadPromise;

  item.status = "loading";
  const token = drainToken;
  item.loadPromise = (async () => {
    try {
      const speakText = item.text.trim().slice(0, HARD_MAX);
      if (!speakText) {
        console.log("[VOICE SKIP EMPTY]", item.text);
        item.status = "error";
        return;
      }
      console.log("[VOICE BEFORE TTS]", speakText);
      console.log("[VOICE DEBUG] 预生成TTS", { text: speakText.slice(0, 80) });
      const response = await authFetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: speakText,
          serviceType: ttsNaturalizeOptions.serviceType ?? null,
        }),
      });
      if (token !== drainToken) return;
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(data.error || "语音播报失败");
      }
      const buffer = await response.arrayBuffer();
      if (token !== drainToken) return;
      item.url = URL.createObjectURL(
        new Blob([buffer], { type: "audio/mpeg" }),
      );
      item.status = "ready";
      console.log("[VOICE AUDIO CREATED]");
      console.log("文本:");
      console.log(speakText);
      console.log("[VOICE DEBUG] TTS预生成完成", {
        bytes: buffer.byteLength,
        text: item.text.slice(0, 40),
      });
    } catch (err) {
      console.error("[VOICE DEBUG] TTS预生成失败", err);
      item.status = "error";
    }
  })();

  return item.loadPromise;
}

async function playReadyUrl(url: string, text: string): Promise<void> {
  stopCurrentAudio();
  const audio = new Audio(url);
  currentAudio = audio;
  await new Promise<void>((resolve, reject) => {
    audio.onended = () => {
      console.log("[VOICE AUDIO END]");
      console.log("文本:");
      console.log(text);
      if (currentAudio === audio) currentAudio = null;
      resolve();
    };
    audio.onerror = () => {
      if (currentAudio === audio) currentAudio = null;
      reject(new Error("音频播放失败"));
    };
    console.log("[VOICE AUDIO PLAY]");
    console.log("文本:");
    console.log(text);
    console.log("[VOICE DEBUG] audio.play执行");
    void audio.play().then(() => undefined).catch(reject);
  });
}

/** 播放循环：下一段音频已预生成则无缝衔接 */
async function pumpPlayback() {
  if (playRunning) return;
  playRunning = true;
  const token = drainToken;
  onTtsSpeaking?.();

  try {
    while (true) {
      if (token !== drainToken) return;
      prefetchAhead();

      const item = ttsQueue[0];
      if (!item) break;

      await ensureItemReady(item);
      if (token !== drainToken) return;

      ttsQueue.shift();
      prefetchAhead(); // 播放当前段时继续预生成后面

      if (item.status !== "ready" || !item.url) {
        continue;
      }

      const url = item.url;
      const playText = item.text;
      try {
        await playReadyUrl(url, playText);
      } catch (err) {
        console.error("[VOICE DEBUG] 播放失败", err);
      } finally {
        try {
          URL.revokeObjectURL(url);
        } catch {
          // ignore
        }
      }
    }
  } finally {
    if (token === drainToken) {
      playRunning = false;
      if (ttsQueue.length === 0) {
        ttsActive = false;
        onTtsIdle?.();
      }
    }
  }
}

export async function playTts(text: string): Promise<void> {
  console.log("[VOICE BEFORE TTS]", text);
  beginTtsPlayback();
  enqueueTtsSentences([text]);
}

export function stopTts() {
  clearTtsQueue();
}

/** 开始 MediaRecorder 录音（优先 webm，最长 30s） */
export async function startRecording(options?: {
  onMaxDuration?: () => void;
  /** 有新分片时回调（可用于实时预览） */
  onChunk?: () => void;
}): Promise<void> {
  if (isProcessing) return;
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    throw new Error("当前浏览器不支持麦克风录音。");
  }

  clearTtsQueue();

  if (mediaRecorder && mediaRecorder.state === "recording") {
    return;
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      channelCount: 1,
    },
  });
  mediaStream = stream;
  audioChunks = [];
  recordStartedAt = Date.now();

  const mimeType = pickMimeType();
  const recorder = mimeType
    ? new MediaRecorder(stream, {
        mimeType,
        audioBitsPerSecond: 24000,
      })
    : new MediaRecorder(stream);

  mediaRecorder = recorder;
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) {
      audioChunks.push(event.data);
      options?.onChunk?.();
    }
  };
  // 稍大分片，便于预览 STT 有足够音频
  recorder.start(1200);

  clearMaxRecordTimer();
  onMaxRecord = options?.onMaxDuration ?? null;
  maxRecordTimer = setTimeout(() => {
    onMaxRecord?.();
  }, MAX_RECORD_MS);
}

/** 当前累计录音快照（不停止录音） */
export function getRecordingPreviewBlob(): Blob | null {
  if (audioChunks.length === 0) return null;
  const type = mediaRecorder?.mimeType || "audio/webm";
  return new Blob(audioChunks, { type });
}

/** 停止录音并返回音频 Blob（不做 wav 转码） */
export async function stopRecording(): Promise<Blob | null> {
  clearMaxRecordTimer();
  const recorder = mediaRecorder;
  if (!recorder) {
    stopTracks();
    return null;
  }

  const blob = await new Promise<Blob | null>((resolve) => {
    const finish = () => {
      const type = recorder.mimeType || "audio/webm";
      const result =
        audioChunks.length > 0 ? new Blob(audioChunks, { type }) : null;
      audioChunks = [];
      mediaRecorder = null;
      stopTracks();
      resolve(result);
    };

    if (recorder.state === "inactive") {
      finish();
      return;
    }

    recorder.onstop = finish;
    try {
      recorder.requestData?.();
      recorder.stop();
    } catch {
      finish();
    }
  });

  return blob;
}

async function postStt(blob: Blob): Promise<string> {
  const form = new FormData();
  const mime = blob.type || "audio/webm";
  const ext = mime.includes("ogg")
    ? "ogg"
    : mime.includes("mp4")
      ? "m4a"
      : mime.includes("wav")
        ? "wav"
        : "webm";
  form.append("audio", blob, `speech.${ext}`);

  const response = await authFetch("/api/stt", {
    method: "POST",
    body: form,
  });
  const data = (await response.json()) as { text?: string; error?: string };
  if (!response.ok) {
    throw new Error(data.error || "语音识别失败");
  }
  return cleanText(data.text || "");
}

/** 上传音频到 /api/stt，返回识别文字 */
export async function transcribeBlob(blob: Blob): Promise<string> {
  if (isProcessing) {
    throw new Error("语音识别进行中，请稍候。");
  }
  isProcessing = true;
  try {
    return await postStt(blob);
  } finally {
    setTimeout(() => {
      isProcessing = false;
    }, 400);
  }
}

/**
 * 预览用 STT：不占用正式识别锁，可与录音并行。
 * 过短音频直接返回空串。
 */
export async function transcribeBlobPreview(blob: Blob): Promise<string> {
  if (blob.size < 1200) return "";
  try {
    return await postStt(blob);
  } catch {
    return "";
  }
}

type BrowserSpeechRecognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: {
    resultIndex: number;
    results: ArrayLike<{
      isFinal: boolean;
      0: { transcript: string };
    }>;
  }) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type SpeechRecognitionCtor = new () => BrowserSpeechRecognition;

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

let livePreviewRec: BrowserSpeechRecognition | null = null;

/**
 * 浏览器实时听写预览（interim），用于“边说边出字”。
 * 不可用时返回 null，调用方可回退到分段 STT。
 */
export function startLiveTranscriptPreview(options: {
  onUpdate: (text: string) => void;
  lang?: string;
}): (() => void) | null {
  stopLiveTranscriptPreview();
  const Ctor = getSpeechRecognitionCtor();
  if (!Ctor) return null;

  const rec = new Ctor();
  livePreviewRec = rec;
  rec.continuous = true;
  rec.interimResults = true;
  rec.lang = options.lang ?? "zh-CN";

  rec.onresult = (event) => {
    let finalText = "";
    let interimText = "";
    for (let i = 0; i < event.results.length; i += 1) {
      const item = event.results[i];
      if (!item) continue;
      const piece = item[0]?.transcript ?? "";
      if (item.isFinal) finalText += piece;
      else interimText += piece;
    }
    const merged = `${finalText}${interimText}`.replace(/\s+/g, " ").trim();
    if (merged) options.onUpdate(merged);
  };

  rec.onerror = () => {
    // 预览失败静默；最终仍走 /api/stt
  };

  try {
    rec.start();
  } catch {
    livePreviewRec = null;
    return null;
  }

  return () => {
    stopLiveTranscriptPreview();
  };
}

export function stopLiveTranscriptPreview() {
  if (!livePreviewRec) return;
  const rec = livePreviewRec;
  livePreviewRec = null;
  rec.onresult = null;
  rec.onerror = null;
  try {
    rec.stop();
  } catch {
    try {
      rec.abort();
    } catch {
      // ignore
    }
  }
}

/**
 * 停止录音 → STT → 文字
 * 开始录音请先调用 startRecording()
 */
export async function recordAudio(): Promise<string> {
  const elapsed = recordStartedAt ? Date.now() - recordStartedAt : 0;
  const blob = await stopRecording();
  if (!blob || blob.size < 64 || elapsed < 280) {
    throw new Error("未录到有效音频，请再说一次。");
  }
  return transcribeBlob(blob);
}
