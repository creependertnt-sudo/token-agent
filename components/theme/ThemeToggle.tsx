"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { authFetch } from "@/lib/client-auth";
import type { AuthUser } from "@/components/chat/types";
import styles from "./ThemeToggle.module.css";

export type ThemePreference = "light" | "dark" | "system";

type SwitchTheme = "light" | "dark";

/** 切换瞬间禁用 transition 一帧，避免边框第一帧闪烁 */
function applyThemeWithSync(setTheme: (theme: string) => void, next: SwitchTheme) {
  const root = document.documentElement;
  root.classList.add("theme-transitioning");
  setTheme(next);
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      root.classList.remove("theme-transitioning");
    });
  });
}

function normalizeTheme(value: string | null | undefined): ThemePreference {
  if (value === "light" || value === "dark" || value === "system") {
    // UI 仅 light/dark；历史 system 收敛到 dark，避免 /chat 被 OS 浅色洗白
    return value === "system" ? "dark" : value;
  }
  return "dark";
}

function toSwitchTheme(
  theme: string | undefined,
  resolved: string | undefined,
): SwitchTheme {
  const current = normalizeTheme(theme ?? "dark");
  if (current === "light" || current === "dark") return current;
  return resolved === "light" ? "light" : "dark";
}

type Props = {
  /** 已登录用户的服务端主题；用于初始化与持久化 */
  userTheme?: string | null;
  onThemeSaved?: (theme: ThemePreference) => void;
};

/**
 * 主题切换：浅色 / 深色 Segmented Control（滑块选中态）。
 * 传入 userTheme 时会写入 User.theme；未登录页仅改本地主题。
 */
export function ThemeToggle({ userTheme, onThemeSaved }: Props) {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [saving, setSaving] = useState(false);
  const shouldPersist = userTheme != null || onThemeSaved != null;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || !userTheme) return;
    const next = normalizeTheme(userTheme);
    if (theme !== next) setTheme(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, userTheme]);

  async function persist(next: SwitchTheme) {
    applyThemeWithSync(setTheme, next);
    if (!shouldPersist) return;
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
      <div
        className={styles.themeSwitch}
        aria-hidden
        style={{ visibility: "hidden" }}
      >
        <button type="button" tabIndex={-1}>
          ☀ 浅色
        </button>
        <button type="button" tabIndex={-1}>
          🌙 深色
        </button>
      </div>
    );
  }

  const active = toSwitchTheme(theme, resolvedTheme);

  return (
    <div
      className={styles.themeSwitch}
      role="group"
      aria-label="主题"
    >
      <div
        className={styles.indicator}
        style={{
          transform:
            active === "dark" ? "translateX(100%)" : "translateX(0%)",
        }}
        aria-hidden
      />
      <button
        type="button"
        disabled={saving}
        data-active={active === "light"}
        aria-pressed={active === "light"}
        onClick={() => {
          if (active !== "light") void persist("light");
        }}
      >
        ☀ 浅色
      </button>
      <button
        type="button"
        disabled={saving}
        data-active={active === "dark"}
        aria-pressed={active === "dark"}
        onClick={() => {
          if (active !== "dark") void persist("dark");
        }}
      >
        🌙 深色
      </button>
    </div>
  );
}
