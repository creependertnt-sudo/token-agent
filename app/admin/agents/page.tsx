"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { authFetch, readApiError } from "@/lib/client-auth";
import { ThemeToggle } from "@/components/theme/ThemeToggle";

type Version = {
  id: string;
  oldPrompt: string;
  newPrompt: string;
  changedAt: string;
  changedBy: string | null;
};

type AgentItem = {
  id: string;
  name: string;
  serviceType: string;
  systemPrompt: string;
  model: string;
  temperature: number;
  enabled: boolean;
  updatedAt: string;
  versions: Version[];
};

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", { hour12: false });
}

export default function AdminAgentsPage() {
  const { user, loading: authLoading, setUser } = useAuth({ requireAuth: true });
  const [items, setItems] = useState<AgentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [temperature, setTemperature] = useState("0.7");
  const [enabled, setEnabled] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await authFetch("/api/admin/agents");
      const data = (await response.json()) as {
        items?: AgentItem[];
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

  const editing = items.find((item) => item.id === editingId) ?? null;

  function openEdit(item: AgentItem) {
    setEditingId(item.id);
    setPrompt(item.systemPrompt);
    setTemperature(String(item.temperature));
    setEnabled(item.enabled);
    setMessage(null);
  }

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    if (!editingId) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const response = await authFetch(`/api/admin/agents/${editingId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemPrompt: prompt,
          temperature: Number(temperature),
          enabled,
        }),
      });
      const data = (await response.json()) as {
        item?: AgentItem;
        error?: unknown;
      };
      if (!response.ok) throw new Error(readApiError(data, "保存失败"));
      setMessage("已保存，下一次对话请求生效。");
      await load();
      if (data.item) openEdit(data.item);
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
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_0%,rgba(45,212,191,0.1),transparent_30%)]" />
      <div className="relative mx-auto w-full max-w-6xl">
        <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[11px] tracking-[0.18em] text-accent uppercase">
              Admin · Agent Config
            </p>
            <h1 className="mt-1 text-2xl font-semibold text-foreground">
              Agent 配置中心
            </h1>
            <p className="mt-2 text-sm text-muted">
              编辑 Prompt / 温度 / 启停。不改销售决策、扣费与 Tool 协议。
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
              href="/admin/agent"
              className="rounded-xl border border-panel-border px-4 py-2.5 text-sm text-muted hover:text-foreground"
            >
              Agent 监控
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
        {message && (
          <p className="mb-4 rounded-xl border border-accent/30 bg-accent/10 px-4 py-3 text-sm text-accent">
            {message}
          </p>
        )}

        {loading ? (
          <p className="text-sm text-muted">正在读取配置...</p>
        ) : (
          <div className="overflow-x-auto rounded-3xl border border-panel-border bg-panel">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-panel-border text-xs text-muted">
                  <th className="px-4 py-3 font-medium">名称</th>
                  <th className="px-4 py-3 font-medium">类型</th>
                  <th className="px-4 py-3 font-medium">模型</th>
                  <th className="px-4 py-3 font-medium">状态</th>
                  <th className="px-4 py-3 font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-b border-panel-border/60">
                    <td className="px-4 py-3 text-foreground">{item.name}</td>
                    <td className="px-4 py-3 text-muted">{item.serviceType}</td>
                    <td className="px-4 py-3 text-muted">{item.model}</td>
                    <td className="px-4 py-3">
                      {item.enabled ? "启用" : "关闭"}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => openEdit(item)}
                        className="text-accent hover:underline"
                      >
                        编辑
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {editing && (
          <form
            onSubmit={handleSave}
            className="mt-6 rounded-3xl border border-panel-border bg-panel p-5"
          >
            <h2 className="text-sm font-semibold text-foreground">
              编辑 {editing.name}（{editing.serviceType}）
            </h2>
            <label className="mt-4 block text-sm">
              <span className="text-muted">Prompt</span>
              <textarea
                required
                rows={14}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                className="mt-1 w-full rounded-xl border border-panel-border bg-card px-3 py-2 font-mono text-xs outline-none focus:border-accent/50"
              />
            </label>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="text-sm">
                <span className="text-muted">temperature</span>
                <input
                  required
                  type="number"
                  min={0}
                  max={2}
                  step={0.05}
                  value={temperature}
                  onChange={(e) => setTemperature(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-panel-border bg-card px-3 py-2 outline-none focus:border-accent/50"
                />
              </label>
              <label className="flex items-center gap-2 pt-6 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) => setEnabled(e.target.checked)}
                />
                启用
              </label>
            </div>
            <div className="mt-4 flex gap-3">
              <button
                type="submit"
                disabled={saving}
                className="rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-[#042f2e] disabled:opacity-50"
              >
                {saving ? "保存中..." : "保存"}
              </button>
              <button
                type="button"
                onClick={() => setEditingId(null)}
                className="rounded-xl border border-panel-border px-4 py-2.5 text-sm text-muted"
              >
                取消
              </button>
            </div>

            {editing.versions.length > 0 && (
              <div className="mt-6">
                <h3 className="text-xs font-semibold tracking-wide text-muted uppercase">
                  Prompt 版本
                </h3>
                <ul className="mt-2 space-y-2 text-xs text-muted">
                  {editing.versions.map((version) => (
                    <li
                      key={version.id}
                      className="rounded-2xl border border-panel-border bg-card px-4 py-2"
                    >
                      {formatTime(version.changedAt)} ·{" "}
                      {version.changedBy || "未知"} · 由{" "}
                      {version.oldPrompt.slice(0, 40)}… 改为{" "}
                      {version.newPrompt.slice(0, 40)}…
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
