"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";
import { saveAuthSession } from "@/lib/client-auth";
import type { AuthUser } from "@/components/chat/types";

export default function LoginPage() {
  const router = useRouter();
  const { loading: authLoading } = useAuth({ redirectIfAuth: "/select-ai" });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
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
      setError(err instanceof Error ? err.message : "登录失败");
    } finally {
      setIsLoading(false);
    }
  }

  if (authLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background text-sm text-muted">
        正在检查登录状态...
      </div>
    );
  }

  return (
    <div className="relative flex h-screen flex-col items-center justify-center overflow-y-auto bg-background px-4">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(45,212,191,0.12),transparent_35%)]" />
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative w-full max-w-md rounded-3xl border border-panel-border bg-panel p-8 shadow-2xl"
      >
        <p className="text-[11px] tracking-[0.18em] text-accent uppercase">
          Welcome back
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-foreground">登录</h1>
        <p className="mt-2 text-sm text-muted">
          登录后开始与 Token Sales AI 对话
        </p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          <div>
            <label className="mb-2 block text-sm text-muted">邮箱</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-panel-border bg-[#0a111b] px-4 py-3 text-sm text-foreground outline-none focus:border-accent/50"
              required
            />
          </div>

          <div>
            <label className="mb-2 block text-sm text-muted">密码</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-panel-border bg-[#0a111b] px-4 py-3 text-sm text-foreground outline-none focus:border-accent/50"
              required
            />
          </div>

          {error && (
            <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-300">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full rounded-xl bg-accent py-3 text-sm font-semibold text-[#042f2e] disabled:opacity-50"
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
      </motion.div>
    </div>
  );
}
