import type { ChatMessage } from "@/components/chat/types";
import type { ChatServiceType } from "@/lib/constants";

/** 用户可见的会话列表（localStorage） */
export const CHAT_LIST_KEY = "chatList";
/** 旧版 key，读取时迁移到 chatList */
const LEGACY_HISTORY_KEY = "token_agent_chat_history_v1";
const ACTIVE_KEY = "token_agent_chat_history_active";
const MAX_ENTRIES = 30;

export type ChatHistoryEntry = {
  id: string;
  title: string;
  updatedAt: string;
  messages: ChatMessage[];
  conversationId: string | null;
  serviceType: ChatServiceType | null;
  serviceId: string | null;
  sendCount: number;
  /** 侧边栏置顶（排在最前，不改 updatedAt） */
  pinned?: boolean;
};

function isEntry(row: unknown): row is ChatHistoryEntry {
  return (
    Boolean(row) &&
    typeof row === "object" &&
    typeof (row as ChatHistoryEntry).id === "string" &&
    typeof (row as ChatHistoryEntry).title === "string" &&
    typeof (row as ChatHistoryEntry).updatedAt === "string" &&
    Array.isArray((row as ChatHistoryEntry).messages)
  );
}

function safeParse(raw: string | null): ChatHistoryEntry[] {
  if (!raw) return [];
  try {
    const data = JSON.parse(raw) as unknown;
    if (!Array.isArray(data)) return [];
    return data.filter(isEntry).slice(0, MAX_ENTRIES);
  } catch {
    return [];
  }
}

function readRawList(): ChatHistoryEntry[] {
  try {
    const primary = safeParse(localStorage.getItem(CHAT_LIST_KEY));
    if (primary.length > 0) return primary;

    // 迁移旧数据 → chatList
    const legacy = safeParse(localStorage.getItem(LEGACY_HISTORY_KEY));
    if (legacy.length > 0) {
      localStorage.setItem(CHAT_LIST_KEY, JSON.stringify(legacy));
      try {
        localStorage.removeItem(LEGACY_HISTORY_KEY);
      } catch {
        // ignore
      }
      return legacy;
    }
    return [];
  } catch {
    return [];
  }
}

function writeList(list: ChatHistoryEntry[]) {
  localStorage.setItem(CHAT_LIST_KEY, JSON.stringify(list.slice(0, MAX_ENTRIES)));
}

/** 去掉流式中间态，控制体积 */
export function sanitizeHistoryMessages(messages: ChatMessage[]): ChatMessage[] {
  return messages
    .filter((m) => {
      if (m.role === "system") return Boolean(m.content?.trim());
      if (m.streaming && !m.content?.trim()) return false;
      return Boolean(m.content?.trim()) || m.role === "user";
    })
    .map((m) => ({
      ...m,
      streaming: false,
      thinking: false,
    }))
    .slice(-80);
}

function sortChatList(list: ChatHistoryEntry[]): ChatHistoryEntry[] {
  return [...list].sort((a, b) => {
    const pinA = a.pinned ? 1 : 0;
    const pinB = b.pinned ? 1 : 0;
    if (pinA !== pinB) return pinB - pinA;
    return (
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  });
}

export function listChatHistory(): ChatHistoryEntry[] {
  try {
    return sortChatList(readRawList());
  } catch {
    return [];
  }
}

export function getActiveHistoryId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
}

export function setActiveHistoryId(id: string | null) {
  try {
    if (id) localStorage.setItem(ACTIVE_KEY, id);
    else localStorage.removeItem(ACTIVE_KEY);
  } catch {
    // ignore
  }
}

export function getChatHistoryById(id: string): ChatHistoryEntry | null {
  return listChatHistory().find((e) => e.id === id) ?? null;
}

/**
 * 最近一条有实质对话的会话（按 updatedAt，忽略置顶排序）。
 * 用于新对话起点的上下文感知。
 */
export function getLastChat(): ChatHistoryEntry | null {
  try {
    const list = readRawList()
      .filter((e) =>
        e.messages.some((m) => m.role === "user" && Boolean(m.content?.trim())),
      )
      .sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );
    return list[0] ?? null;
  } catch {
    return null;
  }
}

export function getLatestChatHistory(): ChatHistoryEntry | null {
  const list = listChatHistory();
  const activeId = getActiveHistoryId();
  if (activeId) {
    const active = list.find((e) => e.id === activeId);
    if (active && active.messages.some((m) => m.role === "user")) return active;
  }
  return list.find((e) => e.messages.some((m) => m.role === "user")) ?? null;
}

/**
 * 写入 / 更新会话。
 * `touchUpdatedAt: true` 才会刷新排序时间（仅发送成功 / 回复完成时应开启）。
 * 切换、改名、静默同步消息等不要 touch，避免列表乱跳。
 */
export function upsertChatHistory(
  entry: Omit<ChatHistoryEntry, "updatedAt"> & { updatedAt?: string },
  opts?: { touchUpdatedAt?: boolean },
): ChatHistoryEntry[] {
  try {
    const prev = readRawList();
    const existing = prev.find((e) => e.id === entry.id);
    const touch = opts?.touchUpdatedAt === true;
    const updatedAt = touch
      ? new Date().toISOString()
      : (entry.updatedAt ??
        existing?.updatedAt ??
        new Date().toISOString());

    const next: ChatHistoryEntry = {
      ...entry,
      title: entry.title.trim() || "新对话",
      messages: sanitizeHistoryMessages(entry.messages),
      updatedAt,
      pinned:
        typeof entry.pinned === "boolean"
          ? entry.pinned
          : Boolean(existing?.pinned),
    };

    // 没有用户消息则不入库
    if (!next.messages.some((m) => m.role === "user")) {
      return listChatHistory();
    }

    const list = sortChatList(
      [next, ...prev.filter((e) => e.id !== next.id)].slice(0, MAX_ENTRIES),
    );
    writeList(list);
    setActiveHistoryId(next.id);
    return list;
  } catch {
    return listChatHistory();
  }
}

export function removeChatHistory(id: string): ChatHistoryEntry[] {
  try {
    const list = listChatHistory().filter((e) => e.id !== id);
    writeList(list);
    if (getActiveHistoryId() === id) {
      setActiveHistoryId(list[0]?.id ?? null);
    }
    return list;
  } catch {
    return listChatHistory();
  }
}

/** 置顶 / 取消置顶会话（不改 updatedAt） */
export function setChatHistoryPinned(
  id: string,
  pinned: boolean,
): ChatHistoryEntry[] {
  try {
    const prev = readRawList();
    if (!prev.some((e) => e.id === id)) return listChatHistory();
    const list = sortChatList(
      prev.map((e) => (e.id === id ? { ...e, pinned } : e)),
    );
    writeList(list);
    return list;
  } catch {
    return listChatHistory();
  }
}

/** 仅改标题，不切换 active、不刷新 updatedAt */
export function renameChatHistory(
  id: string,
  title: string,
): ChatHistoryEntry[] {
  try {
    const nextTitle = title.replace(/\s+/g, " ").trim().slice(0, 32) || "新对话";
    const prev = readRawList();
    if (!prev.some((e) => e.id === id)) return listChatHistory();
    const list = sortChatList(
      prev.map((e) => (e.id === id ? { ...e, title: nextTitle } : e)),
    );
    writeList(list);
    return list;
  } catch {
    return listChatHistory();
  }
}

export function formatHistoryTime(iso: string, now = Date.now()): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const diff = Math.max(0, now - t);
  const min = Math.floor(diff / 60000);
  if (min < 1) return "刚刚";
  if (min < 60) return `${min} 分钟前`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "昨天";
  if (days < 7) return `${days} 天前`;
  return new Date(iso).toLocaleDateString("zh-CN", {
    month: "numeric",
    day: "numeric",
  });
}

export type HistoryGroupKey = "pinned" | "today" | "yesterday" | "earlier";

export type HistoryGroup = {
  key: HistoryGroupKey;
  label: string;
  entries: ChatHistoryEntry[];
};

function startOfLocalDay(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** 置顶优先；其余按 updatedAt 本地日界线：今天 / 昨天 / 更早 */
export function groupChatHistoryByUpdatedAt(
  entries: ChatHistoryEntry[],
  now = Date.now(),
): HistoryGroup[] {
  const pinnedEntries = entries.filter((e) => e.pinned);
  const rest = entries.filter((e) => !e.pinned);

  const todayStart = startOfLocalDay(now);
  const yesterdayStart = todayStart - 86_400_000;
  const buckets: Record<"today" | "yesterday" | "earlier", ChatHistoryEntry[]> =
    {
      today: [],
      yesterday: [],
      earlier: [],
    };

  for (const entry of rest) {
    const t = new Date(entry.updatedAt).getTime();
    if (!Number.isFinite(t) || t < yesterdayStart) {
      buckets.earlier.push(entry);
    } else if (t >= todayStart) {
      buckets.today.push(entry);
    } else {
      buckets.yesterday.push(entry);
    }
  }

  const order: { key: HistoryGroupKey; label: string; list: ChatHistoryEntry[] }[] =
    [
      { key: "pinned", label: "置顶", list: pinnedEntries },
      { key: "today", label: "今天", list: buckets.today },
      { key: "yesterday", label: "昨天", list: buckets.yesterday },
      { key: "earlier", label: "更早", list: buckets.earlier },
    ];

  return order
    .filter(({ list }) => list.length > 0)
    .map(({ key, label, list }) => ({
      key,
      label,
      entries: list,
    }));
}

export function isProjectTopic(
  title: string | null | undefined,
  messages: ChatMessage[],
): boolean {
  const userBlob = messages
    .filter((m) => m.role === "user")
    .map((m) => m.content)
    .join(" ");
  const blob = `${title ?? ""} ${userBlob}`;
  return /项目|方案|系统|平台|客服|产品|落地|架构|优化|搭建|开发/.test(blob);
}

export function makeResumeAssistantContent(_title: string | null): string {
  return "我们刚刚在继续你的这个问题，我可以接着帮你完善 👇";
}
