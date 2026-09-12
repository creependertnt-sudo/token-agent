"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { saveAuthSession } from "@/lib/client-auth";
import type { AuthUser } from "@/components/chat/types";
import { PasswordField } from "@/components/auth/PasswordField";
import enter from "@/components/auth/auth-enter.module.css";
import { AmbientBackground } from "@/components/ui/AmbientBackground";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { friendlyAuthError, isValidEmailFormat } from "@/lib/auth-form";

export default function LoginPage() {
  const router = useRouter();
  const { loading: authLoading } = useAuth({ redirectIfAuth: "/select-ai" });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isLoading) return;
    setError(null);

    if (!email.trim() || !password) {
      setError("请填写邮箱和密码");
      return;
    }

    if (!isValidEmailFormat(email)) {
      setError("请输入正确邮箱地址");
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });

      const data: {
        error?: string;
        token?: string;
        user?: AuthUser;
      } = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "登录失败");
      }

      if (!data.token || !data.user) {
        throw new Error("登录响应缺少凭证");
      }

      saveAuthSession(data.token, data.user);
      router.replace("/select-ai");
    } catch (err) {
      setError(
        friendlyAuthError(err instanceof Error ? err.message : "登录失败"),
      );
    } finally {
      setIsLoading(false);
    }
  }

  if (authLoading) {
    return (
      <div className="relative flex h-screen items-center justify-center overflow-hidden bg-background text-sm text-muted">
        <AmbientBackground />
        <span className="relative">正在检查登录状态...</span>
      </div>
    );
  }

  return (
    <div className="relative flex h-screen flex-col items-center justify-center overflow-x-hidden overflow-y-auto bg-background px-4">
      <AmbientBackground />
      <div className="absolute top-4 right-4 z-20 sm:top-6 sm:right-6">
        <ThemeToggle />
      </div>
      <div
        className={`${enter.card} theme-surface relative w-full max-w-md rounded-3xl border p-8`}
      >
        <div className={enter.header}>
          <p className="text-[11px] tracking-[0.18em] text-accent uppercase">
            Welcome back
          </p>
          <h1 className="mt-2 text-2xl font-semibold text-foreground">登录</h1>
          <p className="mt-2 text-sm text-muted">
            登录后开始与 Mira AI 对话
          </p>
        </div>

        <form onSubmit={handleSubmit} noValidate className={`${enter.form} mt-8 space-y-4`}>
          <div>
            <label htmlFor="login-email" className="mb-2 block text-sm text-muted">
              邮箱
            </label>
            <input
              id="login-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isLoading}
              className="w-full rounded-xl border border-panel-border bg-card px-4 py-3 text-sm text-foreground outline-none transition-colors focus:border-accent/50"
              required
            />
          </div>

          <div>
            <label htmlFor="login-password" className="mb-2 block text-sm text-muted">
              密码
            </label>
            <PasswordField
              id="login-password"
              value={password}
              onChange={setPassword}
              disabled={isLoading}
              autoComplete="current-password"
            />
          </div>

          {error && (
            <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-500 dark:text-red-300">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={isLoading}
            aria-busy={isLoading}
            className="w-full rounded-xl bg-accent py-3 text-sm font-semibold text-[#042f2e] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLoading ? "登录中..." : "登录"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-muted">
          还没有账号？{" "}
          <Link href="/register" className="text-accent underline">
            立即注册
          </Link>
        </p>
      </div>
    </div>
  );
}
