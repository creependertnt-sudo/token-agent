"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect } from "react";

export type ModelSwitchNotice = {
  id: string;
  type: string;
  name: string;
  tokenCost: number;
};

type Props = {
  notice: ModelSwitchNotice | null;
  onDismiss: () => void;
  /** 自动隐藏毫秒数，默认 3200 */
  durationMs?: number;
};

/**
 * 模型切换系统状态通知：非 AI 消息、不进历史、浮层不占消息列表高度。
 */
export function ModelSwitchToast({
  notice,
  onDismiss,
  durationMs = 3200,
}: Props) {
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => onDismiss(), durationMs);
    return () => window.clearTimeout(timer);
  }, [notice, durationMs, onDismiss]);

  return (
    <div className="pointer-events-none absolute inset-x-0 top-3 z-30 flex justify-center px-4">
      <AnimatePresence>
        {notice && (
          <motion.div
            key={notice.id}
            role="status"
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="pointer-events-auto inline-flex max-w-[min(100%,22rem)] items-start gap-2.5 rounded-2xl border border-accent/25 bg-[#0d1520]/95 px-3.5 py-2.5 shadow-[0_12px_40px_rgba(0,0,0,0.45)] backdrop-blur-md"
          >
            <span
              className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/15 text-sm text-accent"
              aria-hidden
            >
              ⚡
            </span>
            <div className="min-w-0 pt-0.5">
              <p className="text-sm font-semibold leading-tight text-foreground">
                已切换 {notice.type}
              </p>
              <p className="mt-0.5 text-[11px] leading-snug text-muted">
                {notice.name}
                {" · "}
                {notice.tokenCost > 0
                  ? `每次消耗 ${notice.tokenCost} Token`
                  : "免费"}
              </p>
            </div>
            <button
              type="button"
              onClick={onDismiss}
              className="ml-1 shrink-0 rounded-lg px-1.5 py-0.5 text-[11px] text-muted transition hover:bg-white/5 hover:text-foreground"
              aria-label="关闭通知"
            >
              ✕
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
