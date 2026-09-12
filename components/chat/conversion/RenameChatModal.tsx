"use client";

import { useEffect, useId, useRef, useState } from "react";
import styles from "./chat.module.css";

type Props = {
  open: boolean;
  chatId: string | null;
  initialTitle: string;
  onSave: (chatId: string, title: string) => void;
  onCancel: () => void;
};

export function RenameChatModal({
  open,
  chatId,
  initialTitle,
  onSave,
  onCancel,
}: Props) {
  const [visible, setVisible] = useState(false);
  const [draft, setDraft] = useState(initialTitle);
  const inputRef = useRef<HTMLInputElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open || !chatId) {
      setVisible(false);
      return;
    }
    setDraft(initialTitle);
    const id = window.requestAnimationFrame(() => {
      setVisible(true);
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    return () => window.cancelAnimationFrame(id);
  }, [open, chatId, initialTitle]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open || !chatId) return null;

  function commit() {
    const next = draft.replace(/\s+/g, " ").trim();
    if (!next || !chatId) return;
    onSave(chatId, next);
  }

  return (
    <div
      className={styles.modalOverlay}
      data-visible={visible}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={onCancel}
    >
      <div
        className={styles.modalCard}
        onClick={(e) => e.stopPropagation()}
      >
        <p className={styles.modalEyebrow}>整理对话</p>
        <h2 id={titleId} className={styles.modalTitle}>
          重命名对话
        </h2>
        <label className={styles.renameLabel} htmlFor={`${titleId}-input`}>
          对话标题
        </label>
        <input
          id={`${titleId}-input`}
          ref={inputRef}
          className={styles.renameInput}
          value={draft}
          maxLength={32}
          placeholder="输入新标题"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            }
          }}
        />
        <div className={styles.modalActions}>
          <button
            type="button"
            className={styles.modalConfirm}
            disabled={!draft.replace(/\s+/g, " ").trim()}
            onClick={commit}
          >
            保存
          </button>
          <button
            type="button"
            className={styles.modalCancel}
            onClick={onCancel}
          >
            取消
          </button>
        </div>
      </div>
    </div>
  );
}
