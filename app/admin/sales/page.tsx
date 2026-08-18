"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { authFetch, readApiError } from "@/lib/client-auth";
import { ThemeToggle } from "@/components/theme/ThemeToggle";

type Funnel = {
  shown: number;
  clicked: number;
  paid: number;
  clickRate: number;
  conversionRate: number;
};

type PackageRow = {
  packageId: string;
  name: string;
  tokenAmount: number;
  price: number;
  shown: number;
  clicked: number;
  paid: number;
  paidOrders: number;
};

type Levels = {
  VIP: number;
  HIGH_VALUE: number;
  POTENTIAL: number;
  LOW_VALUE: number;
  total: number;
};

type Questions = {
  packageQueries: number;
  balanceQueries: number;
  memoryQueries: number;
  orderQueries: number;
  knowledgeQueries: number;
  difyComparisons: number;
  topTools: Array<{ name: string; count: number }>;
};

type SalesAnalyticsStats = {
  funnel: Funnel;
  packages: PackageRow[];
  customerLevels: Levels;
  questions: Questions;
};

function percent(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

export default function AdminSalesPage() {
  const { user, loading: authLoading, setUser } = useAuth({ requireAuth: true });
  const [stats, setStats] = useState<SalesAnalyticsStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadStats = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    setError(null);
    try {
      const response = await authFetch("/api/admin/sales/stats");
      const data = (await response.json()) as SalesAnalyticsStats & {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(readApiError(data, "读取统计失败"));
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

  const maxTool = stats?.questions.topTools[0]?.count ?? 0;
  const maxPackageShown = Math.max(
    1,
    ...(stats?.packages.map((row) => row.shown) ?? [1]),
  );

  return (
    <div className="relative h-screen overflow-y-auto bg-background px-4 py-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_80%_0%,rgba(45,212,191,0.1),transparent_28%)]" />

      <div className="relative mx-auto w-full max-w-6xl">
        <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[11px] tracking-[0.18em] text-accent uppercase">
              Admin · Sales analytics
            </p>
            <h1 className="mt-1 text-2xl font-semibold text-foreground">
              销售分析
            </h1>
            <p className="mt-2 text-sm text-muted">
              只读漏斗、套餐、用户分层与常见问题，不参与扣费与推荐。
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
              href="/admin/knowledge"
              className="rounded-xl border border-panel-border px-4 py-2.5 text-sm text-muted hover:text-foreground"
            >
              知识库
            </Link>
            <Link
              href="/admin/evaluation"
              className="rounded-xl border border-panel-border px-4 py-2.5 text-sm text-muted hover:text-foreground"
            >
              质量评估
            </Link>
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
            <section className="rounded-3xl border border-panel-border bg-panel p-5">
              <h2 className="text-sm font-semibold text-foreground">
                销售转化漏斗
              </h2>
              <p className="mt-1 text-xs text-muted">
                SalesConversion：展示后升级为点击 / 支付
              </p>
              <div className="mt-5 grid gap-4 sm:grid-cols-3">
                <StatCard label="商品展示" value={String(stats.funnel.shown)} />
                <StatCard
                  label="点击"
                  value={String(stats.funnel.clicked)}
                  hint={`点击率 ${percent(stats.funnel.clickRate)}`}
                />
                <StatCard
                  label="支付"
                  value={String(stats.funnel.paid)}
                  hint={`成交率 ${percent(stats.funnel.conversionRate)}`}
                />
              </div>
            </section>

            <section className="mt-6 rounded-3xl border border-panel-border bg-panel p-5">
              <h2 className="text-sm font-semibold text-foreground">
                套餐销售分析
              </h2>
              <p className="mt-1 text-xs text-muted">
                TokenPackage + SalesConversion；成交订单来自 Order.SUCCESS
              </p>
              {stats.packages.length === 0 ? (
                <p className="mt-6 text-sm text-muted">暂无套餐。</p>
              ) : (
                <ul className="mt-5 space-y-4">
                  {stats.packages.map((pkg) => (
                    <li
                      key={pkg.packageId}
                      className="rounded-2xl border border-panel-border bg-card px-4 py-4"
                    >
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <p className="font-medium text-foreground">{pkg.name}</p>
                        <p className="text-xs text-muted">
                          {pkg.tokenAmount.toLocaleString()} Token · ¥{pkg.price}
                        </p>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                        <Metric label="展示" value={pkg.shown} />
                        <Metric label="点击" value={pkg.clicked} />
                        <Metric label="支付" value={pkg.paid} />
                        <Metric label="成交订单" value={pkg.paidOrders} />
                      </div>
                      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-background">
                        <div
                          className="h-full rounded-full bg-accent"
                          style={{
                            width: `${Math.max(4, (pkg.shown / maxPackageShown) * 100)}%`,
                          }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="mt-6 rounded-3xl border border-panel-border bg-panel p-5">
              <h2 className="text-sm font-semibold text-foreground">
                用户价值分析
              </h2>
              <p className="mt-1 text-xs text-muted">
                复用 evaluateCustomerLevel，不复制分层规则
              </p>
              <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard label="VIP" value={String(stats.customerLevels.VIP)} />
                <StatCard
                  label="HIGH_VALUE"
                  value={String(stats.customerLevels.HIGH_VALUE)}
                />
                <StatCard
                  label="POTENTIAL"
                  value={String(stats.customerLevels.POTENTIAL)}
                />
                <StatCard
                  label="LOW_VALUE"
                  value={String(stats.customerLevels.LOW_VALUE)}
                />
              </div>
              <p className="mt-3 text-xs text-muted">
                共 {stats.customerLevels.total} 名用户
              </p>
            </section>

            <section className="mt-6 rounded-3xl border border-panel-border bg-panel p-5">
              <h2 className="text-sm font-semibold text-foreground">
                销售问题分析
              </h2>
              <p className="mt-1 text-xs text-muted">
                基于 AgentToolCall 工具名聚合，不展示参数与用户内容
              </p>
              <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <StatCard
                  label="套餐查询"
                  value={String(stats.questions.packageQueries)}
                />
                <StatCard
                  label="余额查询"
                  value={String(stats.questions.balanceQueries)}
                />
                <StatCard
                  label="Memory 查询"
                  value={String(stats.questions.memoryQueries)}
                />
                <StatCard
                  label="订单查询"
                  value={String(stats.questions.orderQueries)}
                />
                <StatCard
                  label="知识/竞品查询"
                  value={String(stats.questions.knowledgeQueries)}
                />
                <StatCard
                  label="Dify 对比"
                  value={String(stats.questions.difyComparisons)}
                />
              </div>
              <h3 className="mt-6 text-sm font-semibold text-foreground">
                Tool 使用排行
              </h3>
              {stats.questions.topTools.length === 0 ? (
                <p className="mt-4 text-sm text-muted">暂无 Tool 调用。</p>
              ) : (
                <ul className="mt-4 space-y-3">
                  {stats.questions.topTools.map((tool, index) => {
                    const width =
                      maxTool === 0
                        ? 0
                        : Math.max(6, (tool.count / maxTool) * 100);
                    return (
                      <li key={tool.name}>
                        <div className="mb-1 flex items-center justify-between text-sm">
                          <span className="text-foreground">
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
    <div className="rounded-3xl border border-panel-border bg-card p-5">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-foreground">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-0.5 font-semibold text-foreground">{value}</p>
    </div>
  );
}
