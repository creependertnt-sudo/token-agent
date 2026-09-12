"use client";

import type { CSSProperties } from "react";
import { useEffect, useState } from "react";
import { getServiceUiHint } from "@/lib/constants";
import styles from "./ModelSwitchIndicator.module.css";

export type ModelSwitchNotice = {
  id: string;
  type: string;
  name: string;
  tokenCost: number;
};

/** 静态色：Alpha 蓝 / Beta 青 / Gamma 紫 / Guide 灰 */
export const MODEL_COLOR: Record<string, string> = {
  SALES: "#94a3b8",
  LIGHT: "#3b82f6",
  STANDARD: "#2dd4bf",
  PREMIUM: "#a78bfa",
};

type Props = {
  notice: ModelSwitchNotice | null;
  onDismiss: () => void;
  /** 展示时长；切换本身零延迟覆盖 */
  durationMs?: number;
};

type InnerProps = {
  notice: ModelSwitchNotice;
  onDismiss: () => void;
  durationMs: number;
};

function IndicatorInner({ notice, onDismiss, durationMs }: InnerProps) {
  const [active, setActive] = useState(false);
  const color = MODEL_COLOR[notice.type] ?? MODEL_COLOR.STANDARD;
  const hint = getServiceUiHint(notice.type);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setActive(true));
    const timer = window.setTimeout(onDismiss, durationMs);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(timer);
    };
  }, [durationMs, onDismiss]);

  const costPart =
    notice.tokenCost > 0
      ? `每次消耗 ${notice.tokenCost} Token`
      : "免费";
  const desc = [hint, costPart].filter(Boolean).join(" · ");

  return (
    <div
      role="status"
      className={`${styles.switchIndicator} ${active ? styles.switchEnterActive : styles.switchEnter}`}
      style={
        {
          "--model-color": color,
        } as CSSProperties
      }
    >
      <span className={styles.dot} aria-hidden />
      <div className={styles.body}>
        <p className={styles.title}>已切换到 {notice.name}</p>
        <p className={styles.desc}>{desc}</p>
      </div>
      <button
        type="button"
        className={styles.dismiss}
        onClick={onDismiss}
        aria-label="关闭"
      >
        ✕
      </button>
    </div>
  );
}

/**
 * 单实例覆盖：key=serviceType，无队列 / 无横向位移 / 不进消息列表
 */
export function ModelSwitchIndicator({
  notice,
  onDismiss,
  durationMs = 1600,
}: Props) {
  if (!notice) return null;

  return (
    <div className={styles.wrap}>
      <IndicatorInner
        key={notice.type}
        notice={notice}
        onDismiss={onDismiss}
        durationMs={durationMs}
      />
    </div>
  );
}
