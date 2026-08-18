"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { authFetch, readApiError } from "@/lib/client-auth";
import { ThemeToggle } from "@/components/theme/ThemeToggle";

type TenantItem = {
  id: string;
  name: string;
  createdAt: string;
  userCount: number;
  agentCount: number;
};

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", { hour12: false });
}

export default function AdminTenantsPage() {
  const { user, loading: authLoading, setUser } = useAuth({ requireAuth: true });
  const [items, setItems] = useState<TenantItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await authFetch("/api/admin/tenants");
      const data = (await response.json()) as {
        items?: TenantItem[];
        error?: unknown;
      };
      if (!response.ok) throw new Error(readApiError(data, "读取失败"));
      setItems(data.items ?? []);
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

  if (authLoading || !user) {
    return (
      <div className="flex h-screen items-center justify-center bg-background text-sm text-muted">
        加载中...
      </div>
    );
  }

  return (
    <div className="relative h-screen overflow-y-auto bg-background px-4 py-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_16%_0%,rgba(45,212,191,0.1),transparent_30%)]" />
      <div className="relative mx-auto w-full max-w-6xl">
        <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[11px] tracking-[0.18em] text-accent uppercase">
              Admin · Tenants
            </p>
            <h1 className="mt-1 text-2xl font-semibold text-foreground">
              租户
            </h1>
            <p className="mt-2 text-sm text-muted">
              企业隔离基础：用户 / Agent / 知识库 / Memory。不改扣费与销售决策。
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <ThemeToggle
              userTheme={user.theme}
              onThemeSaved={(theme) => setUser({ ...user, theme })}
            />
            <Link
              href="/admin"
              className="rounded-xl border border-panel-border px-4 py-2.5 text-sm text-muted hover:text-foreground"
            >
              总览
            </Link>
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

        {loading ? (
          <p className="text-sm text-muted">正在读取租户...</p>
        ) : (
          <div className="overflow-x-auto rounded-3xl border border-panel-border bg-panel">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-panel-border text-xs text-muted">
                  <th className="px-4 py-3 font-medium">企业名称</th>
                  <th className="px-4 py-3 font-medium">用户数量</th>
                  <th className="px-4 py-3 font-medium">Agent 数量</th>
                  <th className="px-4 py-3 font-medium">创建时间</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-b border-panel-border/60">
                    <td className="px-4 py-3 text-foreground">{item.name}</td>
                    <td className="px-4 py-3 text-muted">{item.userCount}</td>
                    <td className="px-4 py-3 text-muted">{item.agentCount}</td>
                    <td className="px-4 py-3 text-muted">
                      {formatTime(item.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
