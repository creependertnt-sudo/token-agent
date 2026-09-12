"use client";

import { useEffect, type ReactNode } from "react";
import { useAuth } from "@/hooks/useAuth";
import type { AuthUser } from "@/components/chat/types";
import { ChatShellProvider } from "./ChatShellContext";
import { Sidebar } from "./Sidebar";
import styles from "./app-shell.module.css";

type Props = {
  children: ReactNode;
};

/**
 * 产品外壳：左侧 Sidebar + 右侧主内容。
 */
export function AppLayout({ children }: Props) {
  const { user, loading, logout, setUser } = useAuth({ requireAuth: true });

  useEffect(() => {
    const onUser = (event: Event) => {
      const next = (event as CustomEvent<AuthUser>).detail;
      if (next?.id) setUser(next);
    };
    window.addEventListener("mira-auth-user", onUser);
    return () => window.removeEventListener("mira-auth-user", onUser);
  }, [setUser]);

  if (loading || !user) {
    return (
      <div className={styles.shell}>
        <div className={`${styles.main} flex items-center justify-center text-sm text-muted`}>
          加载中…
        </div>
      </div>
    );
  }

  return (
    <ChatShellProvider>
      <div className={styles.shell}>
        <Sidebar user={user} onLogout={() => void logout()} />
        <div className={styles.main}>{children}</div>
      </div>
    </ChatShellProvider>
  );
}
