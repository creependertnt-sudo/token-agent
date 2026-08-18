"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { authFetch, readApiError } from "@/lib/client-auth";
import { ThemeToggle } from "@/components/theme/ThemeToggle";

type ToolRow = {
  name: string;
  calls: number;
  successCount: number;
  successRate: number;
  averageDuration: number | null;
};

type SalesEffect = {
  recommended: number;
  clicked: number;
  paid: number;
  conversionRate: number;
  packages: Array<{ name: string; shown: number; clicked: number; paid: number }>;
};

type ErrorCase = {
  id: string;
  errorType: string;
  question: string;
  summary: string;
  serviceType: string;
  createdAt: string;
};

type EvaluationStats = {
  tools: ToolRow[];
  sales: SalesEffect;
  errors: ErrorCase[];
  feedback: {
    count: number;
    averageRating: number | null;
    recent: Array<{
      id: string;
      agentRunId: string;
      rating: number;
      comment: string | null;
      createdAt: string;
    }>;
  };
  recentRuns: Array<{
    id: string;
    intent: string | null;
    success: boolean;
    serviceType: string;
    createdAt: string;
  }>;
};

function percent(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

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

export default function AdminEvaluationPage() {
  const { user, loading: authLoading, setUser } = useAuth({ requireAuth: true });
  const [stats, setStats] = useState<EvaluationStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [agentRunId, setAgentRunId] = useState("");
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await authFetch("/api/admin/evaluation");
      const data = (await response.json()) as EvaluationStats & { error?: string };
      if (!response.ok) throw new Error(readApiError(data, "读取失败"));
      setStats(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "读取失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading || !user) return;
    void load();
  }, [authLoading, user, load]);

  async function handleFeedback(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const response = await authFetch("/api/admin/evaluation", {
        method: "POST",
        body: JSON.stringify({
          agentRunId,
          rating,
          comment: comment.trim() || undefined,
        }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(readApiError(data, "保存失败"));
      setComment("");
      setMessage("已记录反馈。");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  if (authLoading || !user) {
    return (
      <div className="flex h-screen items-center justify-center bg-background text-sm text-muted">
        加载中...
      </div>
    );
  }

  return (
    <div className="relative h-screen overflow-y-auto bg-background px-4 py-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_70%_0%,rgba(45,212,191,0.1),transparent_28%)]" />
      <div className="relative mx-auto w-full max-w-6xl">
        <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[11px] tracking-[0.18em] text-accent uppercase">
              Admin · Evaluation
            </p>
            <h1 className="mt-1 text-2xl font-semibold text-foreground">
              AI 质量评估
            </h1>
            <p className="mt-2 text-sm text-muted">
              只读分析 AgentRun / Tool / 销售转化，不改变 Agent 行为。
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <ThemeToggle
              userTheme={user.theme}
              onThemeSaved={(theme) => setUser({ ...user, theme })}
            />
            <Link
              href="/admin/agent"
              className="rounded-xl border border-panel-border px-4 py-2.5 text-sm text-muted hover:text-foreground"
            >
              Agent 监控
            </Link>
            <Link
              href="/admin/sales"
              className="rounded-xl border border-panel-border px-4 py-2.5 text-sm text-muted hover:text-foreground"
            >
              销售分析
            </Link>
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
        {message && (
          <p className="mb-4 rounded-xl border border-accent/30 bg-accent-soft px-4 py-3 text-sm">
            {message}
          </p>
        )}

        {loading && !stats ? (
          <p className="text-sm text-muted">正在读取评估数据...</p>
        ) : stats ? (
          <>
            <section className="rounded-3xl border border-panel-border bg-panel p-5">
              <h2 className="text-sm font-semibold text-foreground">
                Agent 回答反馈
              </h2>
              <p className="mt-1 text-xs text-muted">
                平均分 {stats.feedback.averageRating ?? "—"} · {stats.feedback.count} 条
              </p>
              <form
                onSubmit={handleFeedback}
                className="mt-4 grid gap-3 md:grid-cols-[1fr_auto_1fr_auto]"
              >
                <select
                  value={agentRunId}
                  onChange={(e) => setAgentRunId(e.target.value)}
                  required
                  className="rounded-xl border border-panel-border bg-card px-3 py-2 text-sm"
                >
                  <option value="">选择最近一次 AgentRun</option>
                  {stats.recentRuns.map((run) => (
                    <option key={run.id} value={run.id}>
                      {formatTime(run.createdAt)} · {run.serviceType} ·{" "}
                      {run.intent ?? "无意图"} · {run.success ? "成功" : "失败"}
                    </option>
                  ))}
                </select>
                <select
                  value={rating}
                  onChange={(e) => setRating(Number(e.target.value))}
                  className="rounded-xl border border-panel-border bg-card px-3 py-2 text-sm"
                >
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>
                      {n} 分
                    </option>
                  ))}
                </select>
                <input
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="评语（可选）"
                  className="rounded-xl border border-panel-border bg-card px-3 py-2 text-sm"
                />
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-[#042f2e] disabled:opacity-50"
                >
                  {saving ? "提交中..." : "提交反馈"}
                </button>
              </form>
              {stats.feedback.recent.length > 0 && (
                <ul className="mt-4 space-y-2 text-sm">
                  {stats.feedback.recent.map((row) => (
                    <li
                      key={row.id}
                      className="rounded-2xl border border-panel-border bg-card px-4 py-2"
                    >
                      {row.rating} 分 · {row.comment || "无评语"} ·{" "}
                      <span className="text-muted">{formatTime(row.createdAt)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="mt-6 rounded-3xl border border-panel-border bg-panel p-5">
              <h2 className="text-sm font-semibold text-foreground">
                Tool 质量统计
              </h2>
              {stats.tools.length === 0 ? (
                <p className="mt-4 text-sm text-muted">暂无 Tool 调用。</p>
              ) : (
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full min-w-[520px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-panel-border text-xs text-muted">
                        <th className="py-2 pr-4 font-medium">Tool</th>
                        <th className="py-2 pr-4 font-medium">调用次数</th>
                        <th className="py-2 pr-4 font-medium">成功率</th>
                        <th className="py-2 font-medium">平均耗时</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.tools.map((tool) => (
                        <tr key={tool.name} className="border-b border-panel-border/60">
                          <td className="py-2.5 pr-4">{tool.name}</td>
                          <td className="py-2.5 pr-4">{tool.calls}</td>
                          <td className="py-2.5 pr-4">{percent(tool.successRate)}</td>
                          <td className="py-2.5">
                            {formatDuration(tool.averageDuration)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="mt-6 rounded-3xl border border-panel-border bg-panel p-5">
              <h2 className="text-sm font-semibold text-foreground">
                销售效果评估
              </h2>
              <div className="mt-5 grid gap-4 sm:grid-cols-4">
                <Stat label="推荐套餐" value={String(stats.sales.recommended)} />
                <Stat label="点击" value={String(stats.sales.clicked)} />
                <Stat label="支付" value={String(stats.sales.paid)} />
                <Stat
                  label="成交率"
                  value={percent(stats.sales.conversionRate)}
                />
              </div>
              <ul className="mt-4 space-y-2">
                {stats.sales.packages.map((pkg) => (
                  <li
                    key={pkg.name}
                    className="flex flex-wrap justify-between gap-2 rounded-2xl border border-panel-border bg-card px-4 py-3 text-sm"
                  >
                    <span>{pkg.name}</span>
                    <span className="text-muted">
                      展示 {pkg.shown} · 点击 {pkg.clicked} · 支付 {pkg.paid}
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="mt-6 rounded-3xl border border-panel-border bg-panel p-5">
              <h2 className="text-sm font-semibold text-foreground">错误案例</h2>
              {stats.errors.length === 0 ? (
                <p className="mt-4 text-sm text-muted">暂无失败 AgentRun。</p>
              ) : (
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full min-w-[640px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-panel-border text-xs text-muted">
                        <th className="py-2 pr-4 font-medium">时间</th>
                        <th className="py-2 pr-4 font-medium">错误类型</th>
                        <th className="py-2 pr-4 font-medium">用户问题</th>
                        <th className="py-2 font-medium">错误摘要</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.errors.map((row) => (
                        <tr key={row.id} className="border-b border-panel-border/60">
                          <td className="py-2.5 pr-4 whitespace-nowrap text-muted">
                            {formatTime(row.createdAt)}
                          </td>
                          <td className="py-2.5 pr-4">{row.errorType}</td>
                          <td className="py-2.5 pr-4">{row.question}</td>
                          <td className="py-2.5">{row.summary}</td>
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl border border-panel-border bg-card p-5">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
    </div>
  );
}
