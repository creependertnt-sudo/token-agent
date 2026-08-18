"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { authFetch, readApiError } from "@/lib/client-auth";
import { ThemeToggle } from "@/components/theme/ThemeToggle";

const SALES_CATEGORIES = [
  { value: "product", label: "产品介绍" },
  { value: "pricing", label: "套餐价格" },
  { value: "model_diff", label: "模型区别" },
  { value: "competitor", label: "竞品分析" },
  { value: "faq", label: "FAQ" },
  { value: "script", label: "销售话术" },
] as const;

type KnowledgeType = "sales" | "competitor";

type KnowledgeItem = {
  id: string;
  type: KnowledgeType;
  title: string;
  category: string;
  excerpt: string;
  content: string;
  keywords: string;
  updatedAt: string;
  name?: string;
  slug?: string;
  strengths?: string;
  differences?: string;
  talkTrack?: string;
};

type FormState = {
  type: KnowledgeType;
  title: string;
  category: string;
  content: string;
  keywords: string;
  strengths: string;
  differences: string;
  talkTrack: string;
};

const EMPTY_FORM: FormState = {
  type: "sales",
  title: "",
  category: "product",
  content: "",
  keywords: "",
  strengths: "",
  differences: "",
  talkTrack: "",
};

function categoryLabel(item: KnowledgeItem): string {
  if (item.type === "competitor") return "COMPETITOR";
  const hit = SALES_CATEGORIES.find((c) => c.value === item.category);
  return hit ? hit.label : item.category.toUpperCase();
}

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", { hour12: false });
}

export default function AdminKnowledgePage() {
  const { user, loading: authLoading, setUser } = useAuth({ requireAuth: true });
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const load = useCallback(async (q = "") => {
    setLoading(true);
    setError(null);
    try {
      const qs = q.trim() ? `?q=${encodeURIComponent(q.trim())}` : "";
      const response = await authFetch(`/api/admin/knowledge${qs}`);
      const data = (await response.json()) as {
        items?: KnowledgeItem[];
        error?: string;
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

  const salesItems = useMemo(
    () => items.filter((item) => item.type === "sales"),
    [items],
  );
  const competitorItems = useMemo(
    () => items.filter((item) => item.type === "competitor"),
    [items],
  );

  function openCreate(type: KnowledgeType) {
    setEditingId(null);
    setForm({
      ...EMPTY_FORM,
      type,
      category: type === "sales" ? "product" : "competitor",
    });
    setFormOpen(true);
    setMessage(null);
  }

  function openEdit(item: KnowledgeItem) {
    setEditingId(item.id);
    setForm({
      type: item.type,
      title: item.title,
      category: item.type === "sales" ? item.category : "competitor",
      content: item.content,
      keywords: item.keywords,
      strengths: item.strengths ?? "",
      differences: item.differences ?? "",
      talkTrack: item.talkTrack ?? "",
    });
    setFormOpen(true);
    setMessage(null);
  }

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const payload =
        form.type === "sales"
          ? {
              type: "sales",
              title: form.title,
              category: form.category,
              content: form.content,
              keywords: form.keywords,
            }
          : {
              type: "competitor",
              name: form.title,
              content: form.content,
              keywords: form.keywords,
              strengths: form.strengths,
              differences: form.differences,
              talkTrack: form.talkTrack,
            };
      const response = editingId
        ? await authFetch(`/api/admin/knowledge/${editingId}`, {
            method: "PUT",
            body: JSON.stringify(payload),
          })
        : await authFetch("/api/admin/knowledge", {
            method: "POST",
            body: JSON.stringify(payload),
          });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(readApiError(data, "保存失败"));
      setFormOpen(false);
      setMessage(editingId ? "已更新，search_knowledge 将使用最新内容。" : "已新增。");
      await load(query);
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(item: KnowledgeItem) {
    const ok = window.confirm(`确认删除「${item.title}」？此操作不可撤销。`);
    if (!ok) return;
    setError(null);
    setMessage(null);
    try {
      const response = await authFetch(`/api/admin/knowledge/${item.id}`, {
        method: "DELETE",
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(readApiError(data, "删除失败"));
      if (editingId === item.id) setFormOpen(false);
      setMessage("已删除。");
      await load(query);
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除失败");
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
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_0%,rgba(45,212,191,0.1),transparent_28%)]" />

      <div className="relative mx-auto w-full max-w-6xl">
        <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[11px] tracking-[0.18em] text-accent uppercase">
              Admin · Knowledge
            </p>
            <h1 className="mt-1 text-2xl font-semibold text-foreground">
              知识库管理
            </h1>
            <p className="mt-2 text-sm text-muted">
              维护 SalesKnowledge / CompetitorKnowledge，供 search_knowledge 直接读取。
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <ThemeToggle
              userTheme={user.theme}
              onThemeSaved={(theme) => setUser({ ...user, theme })}
            />
            <Link
              href="/admin/sales"
              className="rounded-xl border border-panel-border px-4 py-2.5 text-sm text-muted hover:text-foreground"
            >
              销售分析
            </Link>
            <Link
              href="/admin/agent"
              className="rounded-xl border border-panel-border px-4 py-2.5 text-sm text-muted hover:text-foreground"
            >
              Agent 监控
            </Link>
            <Link
              href="/admin/evaluation"
              className="rounded-xl border border-panel-border px-4 py-2.5 text-sm text-muted hover:text-foreground"
            >
              质量评估
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
          <p className="mb-4 rounded-xl border border-accent/30 bg-accent-soft px-4 py-3 text-sm text-foreground">
            {message}
          </p>
        )}

        <div className="mb-6 flex flex-wrap items-center gap-3">
          <form
            className="flex flex-1 flex-wrap gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void load(query);
            }}
          >
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索标题、分类、内容、关键词"
              className="min-w-[200px] flex-1 rounded-xl border border-panel-border bg-panel px-4 py-2.5 text-sm outline-none focus:border-accent/50"
            />
            <button
              type="submit"
              className="rounded-xl border border-panel-border px-4 py-2.5 text-sm text-muted hover:text-foreground"
            >
              搜索
            </button>
          </form>
          <button
            type="button"
            onClick={() => openCreate("sales")}
            className="rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-[#042f2e]"
          >
            新增销售知识
          </button>
          <button
            type="button"
            onClick={() => openCreate("competitor")}
            className="rounded-xl border border-panel-border px-4 py-2.5 text-sm text-muted hover:text-foreground"
          >
            新增竞品知识
          </button>
        </div>

        {formOpen && (
          <form
            onSubmit={handleSave}
            className="mb-6 rounded-3xl border border-panel-border bg-panel p-5"
          >
            <h2 className="text-sm font-semibold text-foreground">
              {editingId
                ? "编辑知识"
                : form.type === "sales"
                  ? "新增销售知识"
                  : "新增竞品知识"}
            </h2>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="text-sm">
                <span className="text-muted">
                  {form.type === "sales" ? "标题" : "竞品名称"}
                </span>
                <input
                  required
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-panel-border bg-card px-3 py-2 outline-none focus:border-accent/50"
                />
              </label>
              {form.type === "sales" ? (
                <label className="text-sm">
                  <span className="text-muted">分类</span>
                  <select
                    value={form.category}
                    onChange={(e) =>
                      setForm({ ...form, category: e.target.value })
                    }
                    className="mt-1 w-full rounded-xl border border-panel-border bg-card px-3 py-2 outline-none focus:border-accent/50"
                  >
                    {SALES_CATEGORIES.map((cat) => (
                      <option key={cat.value} value={cat.value}>
                        {cat.label} ({cat.value.toUpperCase()})
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <label className="text-sm">
                  <span className="text-muted">类型</span>
                  <input
                    disabled
                    value="COMPETITOR"
                    className="mt-1 w-full rounded-xl border border-panel-border bg-card px-3 py-2 text-muted"
                  />
                </label>
              )}
            </div>
            <label className="mt-4 block text-sm">
              <span className="text-muted">内容</span>
              <textarea
                required
                rows={5}
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
                className="mt-1 w-full rounded-xl border border-panel-border bg-card px-3 py-2 outline-none focus:border-accent/50"
              />
            </label>
            <label className="mt-4 block text-sm">
              <span className="text-muted">检索关键词（可选）</span>
              <input
                value={form.keywords}
                onChange={(e) => setForm({ ...form, keywords: e.target.value })}
                className="mt-1 w-full rounded-xl border border-panel-border bg-card px-3 py-2 outline-none focus:border-accent/50"
              />
            </label>
            {form.type === "competitor" && (
              <div className="mt-4 grid gap-4 md:grid-cols-3">
                <label className="text-sm">
                  <span className="text-muted">常见优势</span>
                  <textarea
                    rows={3}
                    value={form.strengths}
                    onChange={(e) =>
                      setForm({ ...form, strengths: e.target.value })
                    }
                    className="mt-1 w-full rounded-xl border border-panel-border bg-card px-3 py-2"
                  />
                </label>
                <label className="text-sm">
                  <span className="text-muted">差异沟通</span>
                  <textarea
                    rows={3}
                    value={form.differences}
                    onChange={(e) =>
                      setForm({ ...form, differences: e.target.value })
                    }
                    className="mt-1 w-full rounded-xl border border-panel-border bg-card px-3 py-2"
                  />
                </label>
                <label className="text-sm">
                  <span className="text-muted">推荐话术</span>
                  <textarea
                    rows={3}
                    value={form.talkTrack}
                    onChange={(e) =>
                      setForm({ ...form, talkTrack: e.target.value })
                    }
                    className="mt-1 w-full rounded-xl border border-panel-border bg-card px-3 py-2"
                  />
                </label>
              </div>
            )}
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
                onClick={() => setFormOpen(false)}
                className="rounded-xl border border-panel-border px-4 py-2.5 text-sm text-muted"
              >
                取消
              </button>
            </div>
          </form>
        )}

        {loading ? (
          <p className="text-sm text-muted">正在读取知识列表...</p>
        ) : (
          <div className="grid gap-6 lg:grid-cols-2">
            <KnowledgeSection
              title="销售知识"
              empty="暂无销售知识。"
              items={salesItems}
              onEdit={openEdit}
              onDelete={handleDelete}
            />
            <KnowledgeSection
              title="竞品知识"
              empty="暂无竞品知识。"
              items={competitorItems}
              onEdit={openEdit}
              onDelete={handleDelete}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function KnowledgeSection({
  title,
  empty,
  items,
  onEdit,
  onDelete,
}: {
  title: string;
  empty: string;
  items: KnowledgeItem[];
  onEdit: (item: KnowledgeItem) => void;
  onDelete: (item: KnowledgeItem) => void;
}) {
  return (
    <section className="rounded-3xl border border-panel-border bg-panel p-5">
      <h2 className="text-sm font-semibold text-foreground">
        {title}（{items.length}）
      </h2>
      {items.length === 0 ? (
        <p className="mt-4 text-sm text-muted">{empty}</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {items.map((item) => (
            <li
              key={item.id}
              className="rounded-2xl border border-panel-border bg-card px-4 py-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-foreground">{item.title}</p>
                  <p className="mt-1 text-xs text-muted">
                    {categoryLabel(item)} · {formatTime(item.updatedAt)}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => onEdit(item)}
                    className="rounded-lg border border-panel-border px-3 py-1.5 text-xs text-muted hover:text-foreground"
                  >
                    编辑
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(item)}
                    className="rounded-lg border border-red-500/30 px-3 py-1.5 text-xs text-red-300 hover:bg-red-500/10"
                  >
                    删除
                  </button>
                </div>
              </div>
              <p className="mt-2 text-sm text-muted">{item.excerpt}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
