"use client";

import { useEffect, useId, useState } from "react";
import styles from "./chat.module.css";

type Props = {
  open: boolean;
  chatId: string | null;
  chatTitle?: string | null;
  onConfirm: (chatId: string) => void;
  onCancel: () => void;
};

export function DeleteChatModal({
  open,
  chatId,
  chatTitle,
  onConfirm,
  onCancel,
}: Props) {
  const [visible, setVisible] = useState(false);
  const titleId = useId();

  useEffect(() => {
    if (!open || !chatId) {
      setVisible(false);
      return;
    }
    const id = window.requestAnimationFrame(() => setVisible(true));
    return () => window.cancelAnimationFrame(id);
  }, [open, chatId]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open || !chatId) return null;

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
        <p className={styles.modalEyebrow}>删除对话</p>
        <h2 id={titleId} className={styles.modalTitle}>
          删除这个对话？
        </h2>
        <p className={styles.modalDesc}>此操作无法撤销</p>
        {chatTitle ? (
          <p className={styles.modalNote}>「{chatTitle}」</p>
        ) : null}
        <div className={styles.modalActions}>
          <button
            type="button"
            className={`${styles.modalDanger} ${styles.confirmDelete}`}
            onClick={() => onConfirm(chatId)}
          >
            删除
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
