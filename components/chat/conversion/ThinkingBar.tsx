"use client";

import { memo, useEffect, useRef, useState } from "react";
import styles from "./chat.module.css";

const PHRASES = [
  "正在理解你的需求…",
  "正在生成最合适的方案…",
] as const;

const MIN_VISIBLE_MS = 400;

type Props = {
  active: boolean;
};

function pickPhrase() {
  return PHRASES[Math.floor(Math.random() * PHRASES.length)] ?? PHRASES[0];
}

/**
 * 仅响应 start / end 两次：active true→显示，false→最少撑满 400ms 后隐藏。
 * 不在展示中途轮询 setState。
 */
function ThinkingBarView({ active }: Props) {
  const [phrase, setPhrase] = useState<string>(PHRASES[0]);
  const [visible, setVisible] = useState(false);
  const startedAtRef = useRef<number | null>(null);
  const wasActiveRef = useRef(false);

  useEffect(() => {
    if (active) {
      if (!wasActiveRef.current) {
        wasActiveRef.current = true;
        startedAtRef.current = Date.now();
        setPhrase(pickPhrase());
        setVisible(true);
      }
      return;
    }

    if (!wasActiveRef.current) return;
    wasActiveRef.current = false;

    const started = startedAtRef.current ?? Date.now();
    const remain = Math.max(0, MIN_VISIBLE_MS - (Date.now() - started));
    const t = window.setTimeout(() => {
      setVisible(false);
    }, remain);
    return () => window.clearTimeout(t);
  }, [active]);

  return (
    <div
      className={styles.thinking}
      data-active={visible}
      aria-live="polite"
      aria-hidden={!visible}
    >
      <span className={styles.thinkingDot} aria-hidden />
      <span>{phrase}</span>
    </div>
  );
}

export const ThinkingBar = memo(ThinkingBarView);
