"use client";

import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import type { AuthUser } from "@/components/chat/types";
import type { ThemePreference } from "@/components/theme/ThemeToggle";
import type { ModelServiceOption } from "@/components/chat/ModelSelector";
import type { ChatServiceType } from "@/lib/constants";
import {
  MODEL_LABEL,
  SERVICE_UI_HINT,
  SERVICE_UI_TONE,
} from "@/lib/constants";
import type { ChatHistoryEntry } from "@/lib/chat-history";
import { RecentChats } from "./RecentChats";
import styles from "./chat.module.css";

const TYPE_ORDER: ChatServiceType[] = ["LIGHT", "STANDARD", "PREMIUM", "SALES"];

type Props = {
  user: AuthUser;
  services: ModelServiceOption[];
  activeServiceId: string | null;
  activeServiceType: ChatServiceType | null;
  /** 会话标题（首条消息后自动生成） */
  chatTitle?: string | null;
  historyEntries?: ChatHistoryEntry[];
  activeHistoryId?: string | null;
  disabled?: boolean;
  onSelectService: (serviceId: string) => void;
  onSelectHistory?: (entry: ChatHistoryEntry) => void;
  onTitleChange?: (title: string) => void;
  onThemeSaved: (theme: ThemePreference) => void;
  /** 当前会话置顶消息数；>0 时显示「查看置顶」 */
  pinnedCount?: number;
  onViewPinned?: () => void;
};

export function ChatHeader({
  user,
  services,
  activeServiceId,
  chatTitle,
  historyEntries = [],
  activeHistoryId = null,
  disabled,
  onSelectService,
  onSelectHistory,
  onTitleChange,
  onThemeSaved,
  pinnedCount = 0,
  onViewPinned,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(chatTitle ?? "");
  const inputRef = useRef<HTMLInputElement>(null);

  const ordered = TYPE_ORDER.map((type) =>
    services.find((s) => s.type === type),
  ).filter(Boolean) as ModelServiceOption[];

  useEffect(() => {
    if (!editing) setDraft(chatTitle ?? "");
  }, [chatTitle, editing]);

  useEffect(() => {
    if (!editing) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [editing]);

  function commitTitle() {
    const next = draft.replace(/\s+/g, " ").trim();
    setEditing(false);
    if (!next || !onTitleChange) {
      setDraft(chatTitle ?? "");
      return;
    }
    if (next !== chatTitle) onTitleChange(next);
  }

  function onTitleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      commitTitle();
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setDraft(chatTitle ?? "");
      setEditing(false);
    }
  }

  return (
    <header className={styles.header}>
      <div className={styles.headerLeft}>
        {onSelectHistory ? (
          <RecentChats
            entries={historyEntries}
            activeId={activeHistoryId}
            disabled={disabled}
            onSelect={onSelectHistory}
          />
        ) : null}

        <div className={styles.headerMeta}>
          {chatTitle || editing ? (
            editing ? (
              <input
                ref={inputRef}
                className={styles.chatTitleInput}
                value={draft}
                maxLength={32}
                disabled={disabled}
                aria-label="编辑对话标题"
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commitTitle}
                onKeyDown={onTitleKeyDown}
              />
            ) : (
              <button
                type="button"
                className={styles.chatTitleBtn}
                title={chatTitle ?? undefined}
                disabled={disabled || !onTitleChange}
                onClick={() => {
                  if (!onTitleChange) return;
                  setDraft(chatTitle ?? "");
                  setEditing(true);
                }}
              >
                <span className={styles.chatTitleText}>{chatTitle}</span>
                <span className={styles.chatTitleEdit} aria-hidden>
                  ✏️
                </span>
              </button>
            )
          ) : (
            <p className={styles.headerPlaceholder}>新对话</p>
          )}

          <div className={styles.modelRow}>
            {ordered.map((svc) => {
              const type = svc.type as ChatServiceType;
              const tone = SERVICE_UI_TONE[type] ?? "guide";
              return (
                <button
                  key={svc.id}
                  type="button"
                  disabled={disabled}
                  data-active={svc.id === activeServiceId}
                  data-tone={tone}
                  className={styles.modelChip}
                  onClick={() => onSelectService(svc.id)}
                >
                  <span className={styles.modelChipName}>
                    {MODEL_LABEL[type] ?? svc.name}
                  </span>
                  <span className={styles.modelChipHint}>
                    {SERVICE_UI_HINT[type] ?? ""}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className={styles.headerRight}>
        {pinnedCount > 0 && onViewPinned ? (
          <button
            type="button"
            className={styles.pinViewBtn}
            disabled={disabled}
            title={`查看置顶（${pinnedCount}）`}
            onClick={onViewPinned}
          >
            <span aria-hidden>📌</span>
            <span>查看置顶</span>
          </button>
        ) : null}
        <ThemeToggle
          userTheme={user.theme}
          onThemeSaved={(theme) => onThemeSaved(theme)}
        />
      </div>
    </header>
  );
}
