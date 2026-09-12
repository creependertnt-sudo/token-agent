"use client";

import { ThemeProvider } from "next-themes";
import type { ReactNode } from "react";

/**
 * 全站主题：html 挂 .light / .dark，与 chat / select / auth 共用 CSS 变量。
 * 关闭 enableSystem，避免 OS 浅色偏好把 /chat 拉成白底而其它页仍像深色。
 */
export function AppThemeProvider({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem={false}
      storageKey="mira-theme"
    >
      {children}
    </ThemeProvider>
  );
}
