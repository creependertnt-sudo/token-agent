"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { authFetch } from "@/lib/client-auth";
import { ThemeToggle } from "@/components/theme/ThemeToggle";

type ToolRank = { name: string; count: number };
type ErrorStat = { message: string; count: number };
type RecentError = {
  message: string | null;
  serviceType: string;
  createdAt: string;
};

type AdminAgentStats = {
  totalRequests: number;
  successCount: number;
  successRate: string;
  averageDuration: number | null;
  topTools: ToolRank[];
  errorCount: number;
  errorStats: ErrorStat[];
  errors: RecentError[];
};

function formatDuration(ms: number | null): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", { hour12: false });
}

export default function AdminAgentPage() {
  const { user, loading: authLoading, setUser } = useAuth({ requireAuth: true });
  const [stats, setStats] = useState<AdminAgentStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadStats = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    setError(null);
    try {
      const response = await authFetch("/api/admin/agent/stats");
      const data = (await response.json()) as AdminAgentStats & {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(data.error ?? "读取统计失败");
      }
      setStats(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "读取统计失败");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading || !user) return;
    void loadStats();
  }, [authLoading, user, loadStats]);

  if (authLoading || !user) {
    return (
      <div className="flex h-screen items-center justify-center bg-background text-sm text-muted">
        加载中...
      </div>
    );
  }

  const maxToolCount = stats?.topTools[0]?.count ?? 0;

  return (
    <div className="relative h-screen overflow-y-auto bg-background px-4 py-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_0%,rgba(45,212,191,0.1),transparent_30%)]" />

      <div className="relative mx-auto w-full max-w-6xl">
        <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[11px] tracking-[0.18em] text-accent uppercase">
              Admin · Read only
            </p>
            <h1 className="mt-1 text-2xl font-semibold text-foreground">
              Agent 监控
            </h1>
            <p className="mt-2 text-sm text-muted">
              基于 AgentRun / AgentToolCall 的只读统计，不参与扣费与推荐。
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <ThemeToggle
              userTheme={user.theme}
              onThemeSaved={(theme) => setUser({ ...user, theme })}
            />
            <button
              type="button"
              onClick={() => void loadStats(true)}
              disabled={refreshing}
              className="rounded-xl border border-panel-border px-4 py-2.5 text-sm text-muted hover:text-foreground disabled:opacity-50"
            >
              {refreshing ? "刷新中..." : "刷新"}
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
          <p className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </p>
        )}

        {loading && !stats ? (
          <p className="text-sm text-muted">正在读取统计...</p>
        ) : stats ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="请求数量" value={String(stats.totalRequests)} />
              <StatCard
                label="成功率"
                value={stats.successRate}
                hint={`${stats.successCount} / ${stats.totalRequests} 成功`}
              />
              <StatCard
                label="平均耗时"
                value={formatDuration(stats.averageDuration)}
                hint="AgentRun.duration"
              />
              <StatCard
                label="错误次数"
                value={String(stats.errorCount)}
                hint="success = false"
              />
            </div>

            <div className="mt-6 grid gap-6 lg:grid-cols-2">
              <section className="rounded-3xl border border-panel-border bg-panel p-5">
                <h2 className="text-sm font-semibold text-foreground">
                  Tool 排行
                </h2>
                <p className="mt-1 text-xs text-muted">
                  按 AgentToolCall 调用次数
                </p>
                {stats.topTools.length === 0 ? (
                  <p className="mt-6 text-sm text-muted">暂无 Tool 调用。</p>
                ) : (
                  <ul className="mt-5 space-y-3">
                    {stats.topTools.map((tool, index) => {
                      const width =
                        maxToolCount === 0
                          ? 0
                          : Math.max(6, (tool.count / maxToolCount) * 100);
                      return (
                        <li key={tool.name}>
                          <div className="mb-1 flex items-center justify-between text-sm">
                            <span className="font-medium text-foreground">
                              {index + 1}. {tool.name}
                            </span>
                            <span className="text-muted">{tool.count}</span>
                          </div>
                          <div className="h-1.5 overflow-hidden rounded-full bg-card">
                            <div
                              className="h-full rounded-full bg-accent"
                              style={{ width: `${width}%` }}
                            />
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>

              <section className="rounded-3xl border border-panel-border bg-panel p-5">
                <h2 className="text-sm font-semibold text-foreground">
                  错误统计
                </h2>
                <p className="mt-1 text-xs text-muted">
                  按公开错误文案聚合（已脱敏）
                </p>
                {stats.errorStats.length === 0 ? (
                  <p className="mt-6 text-sm text-muted">暂无失败请求。</p>
                ) : (
                  <ul className="mt-5 space-y-3">
                    {stats.errorStats.map((row) => (
                      <li
                        key={row.message}
                        className="flex items-start justify-between gap-4 rounded-2xl border border-panel-border bg-card px-4 py-3"
                      >
                        <span className="text-sm text-foreground">
                          {row.message}
                        </span>
                        <span className="shrink-0 text-sm font-semibold text-accent">
                          {row.count}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>

            <section className="mt-6 rounded-3xl border border-panel-border bg-panel p-5">
              <h2 className="text-sm font-semibold text-foreground">
                最近失败
              </h2>
              <p className="mt-1 text-xs text-muted">最多 20 条</p>
              {stats.errors.length === 0 ? (
                <p className="mt-6 text-sm text-muted">暂无失败记录。</p>
              ) : (
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full min-w-[520px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-panel-border text-xs text-muted">
                        <th className="py-2 pr-4 font-medium">时间</th>
                        <th className="py-2 pr-4 font-medium">通道</th>
                        <th className="py-2 font-medium">错误</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.errors.map((row, index) => (
                        <tr
                          key={`${row.createdAt}-${index}`}
                          className="border-b border-panel-border/60"
                        >
                          <td className="py-2.5 pr-4 whitespace-nowrap text-muted">
                            {formatTime(row.createdAt)}
                          </td>
                          <td className="py-2.5 pr-4">{row.serviceType}</td>
                          <td className="py-2.5 text-foreground">
                            {row.message ?? "未知错误"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        ) : null}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-3xl border border-panel-border bg-panel p-5">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-foreground">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}
