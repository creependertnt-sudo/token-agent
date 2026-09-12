"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { ChatHistoryEntry } from "@/lib/chat-history";

export type ChatShellApi = {
  historyEntries: ChatHistoryEntry[];
  activeHistoryId: string | null;
  openHistory: (entry: ChatHistoryEntry) => void;
  startNewChat: () => void;
  clearCurrentChat: () => void;
  openTopUp: () => void;
  /** 侧边栏：置顶 / 取消置顶 */
  toggleChatPinned: (chatId: string) => void;
  /** 侧边栏：打开重命名弹窗 */
  openRenameChat: (chatId: string) => void;
  /** 侧边栏：打开删除确认 */
  openDeleteChat: (chatId: string) => void;
};

type ChatShellContextValue = {
  api: ChatShellApi | null;
  registerChatShell: (api: ChatShellApi | null) => void;
};

const ChatShellContext = createContext<ChatShellContextValue | null>(null);

export function ChatShellProvider({ children }: { children: ReactNode }) {
  const [api, setApi] = useState<ChatShellApi | null>(null);

  const registerChatShell = useCallback((next: ChatShellApi | null) => {
    setApi(next);
  }, []);

  const value = useMemo(
    () => ({ api, registerChatShell }),
    [api, registerChatShell],
  );

  return (
    <ChatShellContext.Provider value={value}>
      {children}
    </ChatShellContext.Provider>
  );
}

export function useChatShell() {
  const ctx = useContext(ChatShellContext);
  if (!ctx) {
    return {
      api: null,
      registerChatShell: () => {},
    };
  }
  return ctx;
}
