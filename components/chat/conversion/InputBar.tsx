"use client";

import {
  FormEvent,
  KeyboardEvent,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import type { VoiceStatus } from "@/app/chat/voice";
import {
  getServiceUiHint,
  getServiceUiLabel,
  SERVICE_CONFIG,
  type ChatServiceType,
} from "@/lib/constants";
import { VoiceControl } from "@/components/VoiceControl";
import styles from "./chat.module.css";

type Props = {
  value: string;
  disabled?: boolean;
  activeServiceType: ChatServiceType | null;
  textareaRef?: RefObject<HTMLTextAreaElement | null>;
  voiceStatus?: VoiceStatus;
  voiceModeEnabled?: boolean;
  isVoiceDraft?: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onInputFocus?: () => void;
  onVoiceHoldStart?: () => void;
  onVoiceHoldEnd?: () => void;
  onVoiceModeChange?: (enabled: boolean) => void;
  onClearVoiceDraft?: () => void;
};

export function InputBar({
  value,
  disabled,
  activeServiceType,
  textareaRef,
  voiceStatus = "idle",
  voiceModeEnabled = false,
  isVoiceDraft = false,
  onChange,
  onSubmit,
  onInputFocus,
  onVoiceHoldStart,
  onVoiceHoldEnd,
  onVoiceModeChange,
  onClearVoiceDraft,
}: Props) {
  const [pulse, setPulse] = useState(false);
  const [btnLoading, setBtnLoading] = useState(false);
  const pulseTimer = useRef<number | null>(null);
  const loadTimer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (pulseTimer.current != null) window.clearTimeout(pulseTimer.current);
      if (loadTimer.current != null) window.clearTimeout(loadTimer.current);
    };
  }, []);

  const cost =
    activeServiceType && activeServiceType !== "SALES"
      ? SERVICE_CONFIG[activeServiceType].cost
      : 0;
  const typing = value.trim().length > 0;
  const modelName = getServiceUiLabel(activeServiceType);
  const modelHint = getServiceUiHint(activeServiceType);
  const recording = voiceStatus === "recording";
  const recognizing = voiceStatus === "recognizing";
  const showDraftClear =
    Boolean(value.trim()) &&
    (isVoiceDraft || recognizing) &&
    !recording;
  const draftPreview = recording || recognizing || isVoiceDraft;

  function clearFeedbackTimers() {
    if (pulseTimer.current != null) window.clearTimeout(pulseTimer.current);
    if (loadTimer.current != null) window.clearTimeout(loadTimer.current);
  }

  function fireSubmit() {
    if (disabled || btnLoading || !value.trim() || recording || recognizing) {
      return;
    }
    clearFeedbackTimers();
    setPulse(true);
    setBtnLoading(true);
    onSubmit();
    pulseTimer.current = window.setTimeout(() => setPulse(false), 80);
    loadTimer.current = window.setTimeout(() => setBtnLoading(false), 100);
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    fireSubmit();
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      fireSubmit();
    }
  }

  function handleChange(next: string) {
    onChange(next);
  }

  return (
    <form className={styles.inputWrap} onSubmit={handleSubmit}>
      {typing && !draftPreview ? (
        <p className={styles.costHint}>
          当前 {modelName}
          {modelHint ? ` · ${modelHint}` : ""}
          {cost > 0 ? ` · 本次约 ${cost} Token` : " · 免费"}
        </p>
      ) : null}

      {recording ? (
        <p className={styles.voiceHint} role="status">
          正在录音… 松手后可改字，确认再点发送
        </p>
      ) : null}

      {recognizing ? (
        <p className={styles.voiceHint} role="status">
          正在识别… 完成后请确认再发送
        </p>
      ) : null}

      {isVoiceDraft && typing && !recording && !recognizing ? (
        <p className={styles.voiceDraftHint} role="status">
          语音草稿：可修改后点发送，或点 × 取消
        </p>
      ) : null}

      <div className={styles.inputRow}>
        <div className={styles.inputFieldWrap}>
          <textarea
            ref={textareaRef}
            className={styles.textarea}
            data-pulse={pulse}
            data-voice-draft={draftPreview ? "true" : "false"}
            value={value}
            disabled={disabled || recording || recognizing}
            placeholder={
              recording || recognizing || (isVoiceDraft && Boolean(value.trim()))
                ? ""
                : "问我关于项目或 AI 的任何问题…"
            }
            rows={1}
            onChange={(e) => handleChange(e.target.value)}
            onKeyDown={onKeyDown}
            onFocus={() => onInputFocus?.()}
          />
          {showDraftClear ? (
            <button
              type="button"
              className={styles.voiceClearBtn}
              title="清除语音内容"
              aria-label="清除语音内容"
              onClick={() => onClearVoiceDraft?.()}
            >
              ×
            </button>
          ) : null}
        </div>

        <button
          type="button"
          className={styles.voiceModeBtn}
          data-on={voiceModeEnabled ? "true" : "false"}
          disabled={disabled || recording || recognizing}
          title={voiceModeEnabled ? "关闭语音模式" : "开启语音模式"}
          aria-pressed={voiceModeEnabled}
          onClick={() => onVoiceModeChange?.(!voiceModeEnabled)}
        >
          语音模式 {voiceModeEnabled ? "开" : "关"}
        </button>

        <VoiceControl
          status={voiceStatus}
          disabled={disabled || !voiceModeEnabled}
          holdToTalk
          onHoldStart={onVoiceHoldStart}
          onHoldEnd={onVoiceHoldEnd}
        />
        <button
          type="submit"
          className={styles.sendBtn}
          data-loading={btnLoading}
          disabled={
            disabled || recording || recognizing || !value.trim()
          }
        >
          {btnLoading ? "…" : "发送"}
        </button>
      </div>
    </form>
  );
}
