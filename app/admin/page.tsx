"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { authFetch, readApiError } from "@/lib/client-auth";
import { ThemeToggle } from "@/components/theme/ThemeToggle";

type Overview = {
  todayRequests: number;
  successRate: string;
  averageDuration: number | null;
  topTool: { name: string; count: number } | null;
  paidOrders: number;
};

function formatDuration(ms: number | null): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

export default function AdminHomePage() {
  const { user, setUser } = useAuth({ requireAuth: true });
  const [stats, setStats] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const response = await authFetch("/api/admin/overview");
      const data = (await response.json()) as Overview & { error?: unknown };
      if (!response.ok) throw new Error(readApiError(data, "读取总览失败"));
      setStats(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "读取总览失败");
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    void load();
  }, [user, load]);

  if (!user) return null;

  return (
    <div className="relative h-screen overflow-y-auto bg-background px-4 py-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(45,212,191,0.1),transparent_28%)]" />
      <div className="relative mx-auto w-full max-w-6xl">
        <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[11px] tracking-[0.18em] text-accent uppercase">
              Admin · Overview
            </p>
            <h1 className="mt-1 text-2xl font-semibold text-foreground">
              Agent 管理总览
            </h1>
            <p className="mt-2 text-sm text-muted">
              今日请求、成功率、耗时、Tool 与成交订单。只读，不改业务决策。
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <ThemeToggle
              userTheme={user.theme}
              onThemeSaved={(theme) => setUser({ ...user, theme })}
            />
            <button
              type="button"
              onClick={() => void load()}
              className="rounded-xl border border-panel-border px-4 py-2.5 text-sm text-muted hover:text-foreground"
            >
              刷新
            </button>
            <Link
              href="/"
              className="rounded-xl border border-panel-border px-4 py-2.5 text-sm text-muted hover:text-foreground"
            >
              返回客服
            </Link>
          </div>
        </div>

        {error && (
          <p className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Card label="今日请求" value={String(stats?.todayRequests ?? "—")} />
          <Card label="成功率" value={stats?.successRate ?? "—"} />
          <Card
            label="平均响应"
            value={formatDuration(stats?.averageDuration ?? null)}
          />
          <Card
            label="Tool 调用"
            value={
              stats?.topTool
                ? `${stats.topTool.name} ${stats.topTool.count}次`
                : "—"
            }
          />
          <Card label="销售成交" value={`${stats?.paidOrders ?? "—"}单`} />
        </div>

        <nav className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <NavCard href="/admin/agent" title="Agent 监控" desc="请求、耗时、错误" />
          <NavCard href="/admin/agents" title="Agent 配置" desc="Prompt / 模型 / 启停" />
          <NavCard href="/admin/sales" title="销售分析" desc="漏斗与套餐" />
          <NavCard href="/admin/knowledge" title="知识库" desc="销售 / 竞品 CRUD" />
          <NavCard href="/admin/tenants" title="租户" desc="企业隔离基础" />
        </nav>
      </div>
    </div>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl border border-panel-border bg-panel p-5">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-2 text-xl font-semibold text-foreground">{value}</p>
    </div>
  );
}

function NavCard({
  href,
  title,
  desc,
}: {
  href: string;
  title: string;
  desc: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-3xl border border-panel-border bg-panel p-5 hover:border-accent/40"
    >
      <p className="font-semibold text-foreground">{title}</p>
      <p className="mt-1 text-sm text-muted">{desc}</p>
    </Link>
  );
}
