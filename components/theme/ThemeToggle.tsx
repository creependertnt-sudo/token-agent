"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { authFetch } from "@/lib/client-auth";
import type { AuthUser } from "@/components/chat/types";

export type ThemePreference = "light" | "dark" | "system";

const CYCLE: ThemePreference[] = ["light", "dark", "system"];

const LABEL: Record<ThemePreference, string> = {
  light: "白天",
  dark: "深色",
  system: "系统",
};

function normalizeTheme(value: string | null | undefined): ThemePreference {
  if (value === "light" || value === "dark" || value === "system") return value;
  return "dark";
}

type Props = {
  /** 已登录用户的服务端主题；用于初始化与持久化 */
  userTheme?: string | null;
  onThemeSaved?: (theme: ThemePreference) => void;
};

/**
 * 右上角主题切换：Light / Dark / System 循环。
 * 登录用户会写入 User.theme。
 */
export function ThemeToggle({ userTheme, onThemeSaved }: Props) {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // 用服务端偏好同步 next-themes（仅挂载后）
  useEffect(() => {
    if (!mounted || !userTheme) return;
    const next = normalizeTheme(userTheme);
    if (theme !== next) setTheme(next);
    // 只在 userTheme 变化时同步，避免覆盖用户刚点的本地选择
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, userTheme]);

  async function persist(next: ThemePreference) {
    setTheme(next);
    setSaving(true);
    try {
      const response = await authFetch("/api/user/profile", {
        method: "PATCH",
        body: JSON.stringify({ theme: next }),
      });
      if (!response.ok) return;
      const data: { user?: AuthUser } = await response.json();
      if (data.user?.theme) {
        onThemeSaved?.(normalizeTheme(data.user.theme));
      } else {
        onThemeSaved?.(next);
      }
    } catch {
      // 忽略网络错误，本地主题仍已切换
    } finally {
      setSaving(false);
    }
  }

  if (!mounted) {
    return (
      <button
        type="button"
        className="rounded-xl border border-panel-border px-3 py-2 text-xs text-muted"
        aria-label="主题"
        disabled
      >
        …
      </button>
    );
  }

  const current = normalizeTheme(theme ?? "dark");
  const icon =
    resolvedTheme === "light" ? "☀" : resolvedTheme === "dark" ? "☾" : "◐";

  return (
    <button
      type="button"
      disabled={saving}
      title={`主题：${LABEL[current]}（点击切换）`}
      aria-label={`当前主题 ${LABEL[current]}，点击切换`}
      onClick={() => {
        const idx = CYCLE.indexOf(current);
        const next = CYCLE[(idx + 1) % CYCLE.length]!;
        void persist(next);
      }}
      className="inline-flex items-center gap-1.5 rounded-xl border border-panel-border px-3 py-2 text-xs text-muted transition hover:border-accent/40 hover:text-foreground disabled:opacity-60"
    >
      <span aria-hidden>{icon}</span>
      <span className="hidden sm:inline">{LABEL[current]}</span>
    </button>
  );
}
