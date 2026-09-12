"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  formatHistoryTime,
  type ChatHistoryEntry,
} from "@/lib/chat-history";
import styles from "./chat.module.css";

type Props = {
  entries: ChatHistoryEntry[];
  activeId: string | null;
  disabled?: boolean;
  onSelect: (entry: ChatHistoryEntry) => void;
};

export function RecentChats({ entries, activeId, disabled, onSelect }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (entries.length === 0) return null;

  return (
    <div className={styles.recentRoot} ref={rootRef}>
      <button
        type="button"
        className={styles.recentTrigger}
        disabled={disabled}
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((v) => !v)}
      >
        最近对话
        <span className={styles.recentCaret} aria-hidden>
          ▼
        </span>
      </button>

      {open ? (
        <div id={listId} className={styles.recentPanel} role="listbox">
          {entries.slice(0, 5).map((entry) => {
            const selected = entry.id === activeId;
            return (
              <button
                key={entry.id}
                type="button"
                role="option"
                aria-selected={selected}
                data-active={selected}
                className={styles.recentItem}
                onClick={() => {
                  setOpen(false);
                  onSelect(entry);
                }}
              >
                <span className={styles.recentItemTitle}>{entry.title}</span>
                <span className={styles.recentItemTime}>
                  {formatHistoryTime(entry.updatedAt)}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
