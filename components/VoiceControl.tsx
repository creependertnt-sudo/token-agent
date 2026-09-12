"use client";

import { useRef, type PointerEvent } from "react";
import type { VoiceStatus } from "@/app/chat/voice";

type VoiceControlProps = {
  status: VoiceStatus;
  disabled?: boolean;
  /** 按住说话（松手结束）；默认 true */
  holdToTalk?: boolean;
  onHoldStart?: () => void;
  onHoldEnd?: () => void;
  /** 点击切换（holdToTalk=false 时） */
  onToggle?: () => void;
};

function statusLabel(status: VoiceStatus): string {
  switch (status) {
    case "recording":
      return "松手确认";
    case "recognizing":
      return "正在识别";
    case "thinking":
      return "思考中";
    case "speaking":
      return "播放中";
    default:
      return "按住说话";
  }
}

function statusIcon(status: VoiceStatus): string {
  switch (status) {
    case "recording":
      return "🔴";
    case "recognizing":
      return "⌛";
    case "thinking":
      return "💭";
    case "speaking":
      return "🔊";
    default:
      return "🎤";
  }
}

export function VoiceControl({
  status,
  disabled,
  holdToTalk = true,
  onHoldStart,
  onHoldEnd,
  onToggle,
}: VoiceControlProps) {
  const busy = status === "recognizing" || status === "thinking";
  const active = status !== "idle";
  const blocked = Boolean(disabled || busy);
  const holdingRef = useRef(false);

  function handlePointerDown(e: PointerEvent<HTMLButtonElement>) {
    if (!holdToTalk || blocked) return;
    if (status === "recognizing" || status === "thinking") return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    holdingRef.current = true;
    onHoldStart?.();
  }

  function handlePointerUp(e: PointerEvent<HTMLButtonElement>) {
    if (!holdToTalk) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    if (!holdingRef.current) return;
    holdingRef.current = false;
    onHoldEnd?.();
  }

  function handleClick() {
    if (holdToTalk || blocked) return;
    onToggle?.();
  }

  return (
    <button
      type="button"
      disabled={blocked}
      onClick={handleClick}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onContextMenu={(e) => e.preventDefault()}
      title={statusLabel(status)}
      aria-label={statusLabel(status)}
      data-voice={status}
      className={[
        "relative inline-flex h-11 min-w-11 shrink-0 select-none items-center justify-center gap-1.5 overflow-hidden rounded-full border px-2.5 text-sm transition-colors touch-none",
        active
          ? "border-accent/40 bg-accent-soft text-foreground"
          : "border-panel-border bg-card text-muted",
        blocked ? "cursor-not-allowed opacity-60" : "cursor-pointer",
      ].join(" ")}
    >
      <span className="relative z-10 inline-flex items-center gap-1.5">
        <span className="text-base leading-none" aria-hidden>
          {statusIcon(status)}
        </span>
        {status !== "idle" ? (
          <span className="hidden max-w-[7.5rem] truncate text-xs sm:inline">
            {statusLabel(status)}
          </span>
        ) : null}
      </span>
    </button>
  );
}
