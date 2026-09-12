/** 聊天沉浸感：轻量延迟与分段揭示（无重动画） */

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

/** 流式 UI 刷屏间隔（80–120ms 取中） */
export const STREAM_UI_INTERVAL_MS = 100;

/** 流结束后收尾停顿，避免瞬间 finalize */
export function streamTailPauseMs(): number {
  return 120 + Math.floor(Math.random() * 61); // 120–180
}

/** 长文分段揭示：超过该长度按段推进，而非一次刷满缓冲 */
export const STREAM_LONG_SEGMENT_CHARS = 280;

/**
 * 找下一段揭示终点：优先句读 / 空行，否则约 N 字。
 */
export function nextStreamRevealEnd(
  full: string,
  from: number,
  segmentChars = STREAM_LONG_SEGMENT_CHARS,
): number {
  if (from >= full.length) return full.length;
  const rest = full.length - from;
  if (rest <= segmentChars) return full.length;

  const softMin = Math.min(48, Math.floor(segmentChars / 2));
  const windowEnd = Math.min(full.length, from + segmentChars + 64);
  const window = full.slice(from, windowEnd);

  const para = window.indexOf("\n\n");
  if (para >= softMin) return from + para + 2;

  let best = -1;
  for (let i = softMin; i < window.length; i += 1) {
    const ch = window[i]!;
    if ("。！？.!?\n".includes(ch)) best = i;
  }
  if (best >= softMin) return from + best + 1;

  return Math.min(full.length, from + segmentChars);
}

/**
 * 节流更新：多次 schedule 只触发一次 update；flush 立刻执行并清空定时器。
 */
export function createThrottledUpdater(
  intervalMs: number,
  update: () => void,
): {
  schedule: () => void;
  flush: () => void;
  cancel: () => void;
} {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const cancel = () => {
    if (timer != null) {
      clearTimeout(timer);
      timer = null;
    }
  };
  return {
    schedule() {
      if (timer != null) return;
      timer = setTimeout(() => {
        timer = null;
        update();
      }, intervalMs);
    },
    flush() {
      cancel();
      update();
    },
    cancel,
  };
}

/** Thinking 最少 400ms，区间 400–600ms */
export function thinkDelayMs(): number {
  return 400 + Math.floor(Math.random() * 201);
}

/** 分段间隔 400–600ms */
export function segmentGapMs(): number {
  return 400 + Math.floor(Math.random() * 201);
}

/**
 * 两段揭示：第一段=核心结论，第二段=补充说明。
 */
export function splitReplySegments(text: string): {
  first: string;
  rest: string;
} {
  const trimmed = text.replace(/\r\n/g, "\n").trim();
  if (!trimmed) return { first: "", rest: "" };

  // 空行分段：首段作结论
  const para = trimmed.indexOf("\n\n");
  if (para > 8 && para < trimmed.length - 4) {
    return {
      first: trimmed.slice(0, para).trimEnd(),
      rest: trimmed.slice(para).replace(/^\n+/, "\n\n"),
    };
  }

  // 按句切：首句（过短则两句）= 结论，其余 = 补充
  const sentences = trimmed.match(/[^。！？.!?]+[。！？.!?]?/g);
  if (sentences && sentences.length >= 2) {
    let take = 1;
    if (sentences[0].trim().length < 18 && sentences.length >= 3) {
      take = 2;
    }
    const first = sentences
      .slice(0, take)
      .join("")
      .trim();
    const rest = sentences.slice(take).join("").trim();
    if (
      rest &&
      first.length >= 6 &&
      first.length <= Math.max(trimmed.length * 0.65, 40)
    ) {
      return {
        first,
        rest: rest.startsWith("\n") ? rest : `\n\n${rest}`,
      };
    }
    if (rest && first.length < trimmed.length * 0.8) {
      return {
        first,
        rest: rest.startsWith("\n") ? rest : `\n\n${rest}`,
      };
    }
  }

  // 长文兜底：前约 45% 到句读处
  if (trimmed.length > 90) {
    let cut = Math.floor(trimmed.length * 0.42);
    const nextBreak = trimmed.slice(cut).search(/[。！？.!?\n]/);
    if (nextBreak >= 0) cut += nextBreak + 1;
    const first = trimmed.slice(0, cut).trimEnd();
    const rest = trimmed.slice(cut).trimStart();
    if (first && rest) {
      return {
        first,
        rest: rest.startsWith("\n") ? rest : `\n\n${rest}`,
      };
    }
  }

  return { first: trimmed, rest: "" };
}

/**
 * 先等满思考延迟（≥400ms）→ 出结论段 → 间隔后再补说明。
 */
export async function revealSegmentedReply(
  fullText: string,
  opts: {
    thinkStartedAt: number;
    thinkMs: number;
    onFirst: (first: string) => void;
    onComplete: (full: string) => void;
  },
): Promise<void> {
  const minThink = Math.max(400, opts.thinkMs);
  const remaining = Math.max(
    0,
    minThink - (Date.now() - opts.thinkStartedAt),
  );
  if (remaining > 0) await sleep(remaining);

  const { first, rest } = splitReplySegments(fullText);
  if (!rest) {
    opts.onComplete(first || fullText);
    return;
  }

  opts.onFirst(first);
  await sleep(segmentGapMs());
  opts.onComplete(fullText.trim());
}
