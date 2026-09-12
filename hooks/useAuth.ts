"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { AuthUser } from "@/components/chat/types";
import {
  authFetch,
  clearAuthSession,
  getStoredToken,
  getStoredUser,
  saveAuthSession,
  updateStoredUser,
} from "@/lib/client-auth";

type UseAuthOptions = {
  /** 未登录时跳转目标；不设则不跳转 */
  requireAuth?: boolean;
  /** 已登录时跳转目标（用于登录/注册页） */
  redirectIfAuth?: string;
};

type UseAuthResult = {
  user: AuthUser | null;
  loading: boolean;
  setUser: (user: AuthUser | null) => void;
  logout: () => Promise<void>;
  refreshUser: () => Promise<AuthUser | null>;
};

/**
 * 统一认证：等待 localStorage + /api/auth/me 完成后再决定是否跳转。
 */
export function useAuth(options: UseAuthOptions = {}): UseAuthResult {
  const { requireAuth = false, redirectIfAuth } = options;
  const router = useRouter();
  const [user, setUserState] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const setUser = useCallback((next: AuthUser | null) => {
    setUserState(next);
    if (next) {
      updateStoredUser(next);
    }
  }, []);

  const refreshUser = useCallback(async () => {
    const token = getStoredToken();
    if (!token) {
      setUserState(null);
      return null;
    }

    const response = await authFetch("/api/auth/me");
    if (response.status === 401) {
      clearAuthSession();
      setUserState(null);
      return null;
    }
    if (!response.ok) {
      // 服务端临时错误：保留本地会话，避免误踢导致登录循环
      return getStoredUser();
    }

    const data: { user: AuthUser } = await response.json();
    saveAuthSession(token, data.user);
    setUserState(data.user);
    return data.user;
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        const token = getStoredToken();
        const cached = getStoredUser();

        // 先用缓存减少闪烁，但仍等服务端校验完成再结束 loading
        if (cached && !cancelled) {
          setUserState(cached);
        }

        if (!token) {
          if (!cancelled) setUserState(null);
          return;
        }

        const response = await authFetch("/api/auth/me");
        if (cancelled) return;

        let body: unknown = null;
        try {
          body = await response.json();
        } catch {
          body = null;
        }

        // 仅 401 视为未登录；500 等保留本地 token，避免登录循环
        if (response.status === 401) {
          clearAuthSession();
          setUserState(null);
          return;
        }

        if (!response.ok) {
          return;
        }

        const data = body as { user?: AuthUser };
        if (!data?.user) {
          return;
        }
        saveAuthSession(token, data.user);
        setUserState(data.user);
      } catch {
        if (!cancelled) {
          // 网络异常时若有本地 token，暂保留缓存用户，避免误踢；无 token 则清
          if (!getStoredToken()) {
            setUserState(null);
          }
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void bootstrap();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅挂载时 bootstrap
  }, []);

  useEffect(() => {
    if (loading) return;

    const token = getStoredToken();

    if (requireAuth && !token) {
      router.replace("/login");
      return;
    }

    // 登录页：有有效会话才跳首页，避免与首页互相抢跳
    if (redirectIfAuth && token && user) {
      router.replace(redirectIfAuth);
    }
  }, [loading, requireAuth, redirectIfAuth, user, router]);

  const logout = useCallback(async () => {
    try {
      await authFetch("/api/auth/logout", { method: "POST" });
    } catch {
      // ignore
    }
    clearAuthSession();
    setUserState(null);
    router.replace("/login");
  }, [router]);

  return { user, loading, setUser, logout, refreshUser };
}
