"use client";

import { useEffect, useId, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { AuthUser } from "@/components/chat/types";
import {
  formatHistoryTime,
  groupChatHistoryByUpdatedAt,
  type ChatHistoryEntry,
} from "@/lib/chat-history";
import { useChatShell } from "./ChatShellContext";
import { ChatMenu, type ChatMenuAction } from "./ChatMenu";
import styles from "./app-shell.module.css";

const SIDEBAR_KEY = "mira_sidebar_expanded";

type Props = {
  user: AuthUser;
  onLogout: () => void;
};

function initialsFrom(user: AuthUser): string {
  const raw = (user.nickname || user.email || "?").trim();
  const ch = raw[0];
  return ch ? ch.toUpperCase() : "?";
}

function ChatHistoryItem({
  entry,
  selected,
  pressed,
  onPick,
  onMenuAction,
}: {
  entry: ChatHistoryEntry;
  selected: boolean;
  pressed: boolean;
  onPick: () => void;
  onMenuAction: (action: ChatMenuAction) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div
      className={styles.chatItemWrapper}
      data-menu-open={menuOpen || undefined}
      data-pinned={entry.pinned || undefined}
    >
      <button
        type="button"
        className={styles.historyItem}
        data-active={selected}
        data-pinned={entry.pinned || undefined}
        data-press={pressed}
        title={entry.title}
        onClick={onPick}
      >
        <span className={styles.historyActiveBar} aria-hidden />
        <span className={styles.historyBody}>
          <span className={styles.historyTitleRow}>
            {selected || entry.pinned ? (
              <span className={styles.historyDot} aria-hidden />
            ) : null}
            <span className={styles.historyTitle}>{entry.title}</span>
          </span>
          <span className={styles.historyTime}>
            {formatHistoryTime(entry.updatedAt)}
          </span>
        </span>
      </button>
      <ChatMenu
        pinned={Boolean(entry.pinned)}
        onOpenChange={setMenuOpen}
        onAction={onMenuAction}
      />
    </div>
  );
}

export function Sidebar({ user, onLogout }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const { api } = useChatShell();
  const [expanded, setExpanded] = useState(true);
  const [panelOpen, setPanelOpen] = useState(false);
  const [avatarTip, setAvatarTip] = useState(false);
  const [optimisticId, setOptimisticId] = useState<string | null>(null);
  const [pressedId, setPressedId] = useState<string | null>(null);
  const [topUpPress, setTopUpPress] = useState(false);
  const [tokenFlash, setTokenFlash] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const prevTokens = useRef(user.tokenBalance);

  useEffect(() => {
    if (prevTokens.current === user.tokenBalance) return;
    prevTokens.current = user.tokenBalance;
    setTokenFlash(true);
    const t = window.setTimeout(() => setTokenFlash(false), 120);
    return () => window.clearTimeout(t);
  }, [user.tokenBalance]);

  useEffect(() => {
    setOptimisticId(null);
  }, [api?.activeHistoryId]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SIDEBAR_KEY);
      if (raw === "0") setExpanded(false);
      if (raw === "1") setExpanded(true);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (!panelOpen && !avatarTip) return;
    const onDoc = (e: MouseEvent) => {
      if (!bottomRef.current?.contains(e.target as Node)) {
        setPanelOpen(false);
        setAvatarTip(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setPanelOpen(false);
        setAvatarTip(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [panelOpen, avatarTip]);

  function toggleExpanded() {
    setExpanded((v) => {
      const next = !v;
      try {
        localStorage.setItem(SIDEBAR_KEY, next ? "1" : "0");
      } catch {
        // ignore
      }
      return next;
    });
  }

  function goChat() {
    if (pathname !== "/chat") router.push("/chat");
  }

  function onPickHistory(entry: ChatHistoryEntry) {
    setOptimisticId(entry.id);
    setPressedId(entry.id);
    window.setTimeout(() => setPressedId(null), 100);
    goChat();
    api?.openHistory(entry);
  }

  function onNewChat() {
    goChat();
    api?.startNewChat();
    setPanelOpen(false);
    setOptimisticId(null);
  }

  function onTopUp() {
    setTopUpPress(true);
    window.setTimeout(() => setTopUpPress(false), 80);
    setPanelOpen(false);
    goChat();
    api?.openTopUp();
  }

  function onChatMenuAction(entry: ChatHistoryEntry, action: ChatMenuAction) {
    if (action === "pin") {
      api?.toggleChatPinned(entry.id);
      return;
    }
    if (action === "rename") {
      goChat();
      api?.openRenameChat(entry.id);
      return;
    }
    if (action === "delete") {
      goChat();
      api?.openDeleteChat(entry.id);
    }
  }

  const displayName = user.nickname?.trim() || user.email;
  const entries = (api?.historyEntries ?? []).slice(0, 20);
  const historyGroups = groupChatHistoryByUpdatedAt(entries);
  const activeId = optimisticId ?? api?.activeHistoryId ?? null;

  return (
    <aside
      className={styles.sidebar}
      data-expanded={expanded}
      aria-label="主导航"
    >
      <div className={styles.sideTop}>
        <div className={styles.logoMark} aria-hidden>
          ✦
        </div>
        <div className={styles.logoCopy}>
          <span className={styles.logoText}>Mira AI</span>
          <span className={styles.logoTagline}>AI 对话与任务助手</span>
        </div>
      </div>

      <div className={styles.sideActions}>
        <button
          type="button"
          className={styles.newChatBtn}
          onClick={onNewChat}
          title="新对话"
        >
          <span aria-hidden>+</span>
          <span className={styles.navLabel}>新对话</span>
        </button>
      </div>

      <nav className={styles.sideNav}>
        <p className={styles.sectionLabel}>
          <span className={styles.navIcon} aria-hidden>
            🧠
          </span>
          <span className={styles.navLabel}>我的对话</span>
        </p>

        {entries.length === 0 ? (
          <p className={styles.emptyHistory}>
            <span className={styles.navLabel}>暂无对话</span>
          </p>
        ) : (
          <div className={styles.historyGroups}>
            {historyGroups.map((group) => (
              <section
                key={group.key}
                className={styles.historyGroup}
                aria-label={group.label}
              >
                <p className={styles.historyGroupLabel}>{group.label}</p>
                <ul className={styles.historyList}>
                  {group.entries.map((entry) => (
                    <li key={entry.id}>
                      <ChatHistoryItem
                        entry={entry}
                        selected={entry.id === activeId}
                        pressed={pressedId === entry.id}
                        onPick={() => onPickHistory(entry)}
                        onMenuAction={(action) =>
                          onChatMenuAction(entry, action)
                        }
                      />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </nav>

      <button
        type="button"
        className={styles.collapseBtn}
        onClick={toggleExpanded}
        aria-expanded={expanded}
      >
        {expanded ? "收起" : "»"}
      </button>

      <div className={styles.sideBottom} ref={bottomRef}>
        {avatarTip ? (
          <div className={styles.avatarTipPanel} role="status">
            头像上传即将开放，敬请期待
          </div>
        ) : null}

        {panelOpen ? (
          <div
            id={panelId}
            className={styles.userPanel}
            role="dialog"
            aria-label="账户信息"
          >
            <div className={styles.panelUser}>
              <span className={styles.avatar} aria-hidden>
                {initialsFrom(user)}
              </span>
              <div className={styles.userMeta}>
                <span className={styles.userName}>{displayName}</span>
                <span className={styles.userTokens}>{user.email}</span>
              </div>
            </div>
            <div className={styles.panelRow}>
              <span className={styles.panelLabel}>当前 Token</span>
              <span
                className={styles.panelValue}
                data-flash={tokenFlash}
              >
                {user.tokenBalance.toLocaleString()}
              </span>
            </div>
            <div className={styles.panelActions}>
              <button
                type="button"
                className={styles.panelLink}
                data-press={topUpPress}
                onClick={onTopUp}
              >
                补充 Token
              </button>
              <button
                type="button"
                className={styles.panelLink}
                onClick={() => {
                  setPanelOpen(false);
                  goChat();
                  api?.clearCurrentChat();
                }}
              >
                清空当前对话
              </button>
              <button
                type="button"
                className={styles.panelDanger}
                onClick={() => {
                  setPanelOpen(false);
                  onLogout();
                }}
              >
                退出登录
              </button>
            </div>
          </div>
        ) : null}

        <div className={styles.userRow}>
          <button
            type="button"
            className={styles.avatarBtn}
            title="更换头像"
            onClick={(e) => {
              e.stopPropagation();
              setPanelOpen(false);
              setAvatarTip(true);
            }}
          >
            <span className={styles.avatarWrap}>
              <span className={styles.avatar} aria-hidden>
                {initialsFrom(user)}
              </span>
              <span className={styles.avatarHint}>更换头像</span>
            </span>
          </button>

          <button
            type="button"
            className={styles.userBtn}
            aria-expanded={panelOpen}
            aria-controls={panelId}
            onClick={() => {
              setAvatarTip(false);
              setPanelOpen((v) => !v);
            }}
          >
            <span className={styles.userMeta}>
              <span className={styles.userName}>{displayName}</span>
            <span className={styles.userTokens} data-flash={tokenFlash}>
              {user.tokenBalance.toLocaleString()} Token
            </span>
            </span>
            <span className={styles.settingsBtn} aria-hidden title="设置">
              ⚙
            </span>
          </button>
        </div>
      </div>
    </aside>
  );
}
