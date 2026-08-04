"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";
import { authFetch } from "@/lib/client-auth";

type AIServiceItem = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  type: string;
  tokenCost: number;
  sortOrder: number;
};

export default function SelectAIPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth({ requireAuth: true });
  const [services, setServices] = useState<AIServiceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectingId, setSelectingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading || !user) return;

    async function load() {
      try {
        const response = await authFetch("/api/services");
        const data: { services?: AIServiceItem[]; error?: string } =
          await response.json();
        if (!response.ok) {
          throw new Error(data.error ?? "加载失败");
        }
        setServices(data.services ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "加载失败，请刷新重试。");
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [authLoading, user]);

  async function handleSelect(serviceId: string) {
    setSelectingId(serviceId);
    setError(null);

    try {
      const response = await authFetch("/api/services/select", {
        method: "POST",
        body: JSON.stringify({ serviceId }),
      });

      const data: { error?: string } = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "选择失败");
      }

      router.replace("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "选择失败");
      setSelectingId(null);
    }
  }

  if (authLoading || !user || loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background text-sm text-muted">
        加载 AI 服务...
      </div>
    );
  }

  return (
    <div className="relative h-screen overflow-y-auto bg-background px-4 py-10">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(45,212,191,0.12),transparent_30%),radial-gradient(circle_at_80%_0%,rgba(56,189,248,0.08),transparent_28%)]" />

      <div className="relative mx-auto w-full max-w-5xl">
        <div className="mb-8 text-center md:text-left">
          <p className="text-[11px] tracking-[0.18em] text-accent uppercase">
            Choose Agent
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-foreground md:text-3xl">
            选择 AI 服务
          </h1>
          <p className="mt-2 text-sm text-muted">
            当前账号 {user.email} · 选择后进入对应工作台
          </p>
        </div>

        {error && (
          <p className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {services.map((service, index) => (
            <motion.button
              key={service.id}
              type="button"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              disabled={selectingId !== null}
              onClick={() => void handleSelect(service.id)}
              className="flex h-full flex-col rounded-3xl border border-panel-border bg-panel p-5 text-left shadow-xl transition hover:border-accent/40 disabled:opacity-60"
            >
              <p className="text-[11px] tracking-[0.16em] text-accent uppercase">
                {service.type}
              </p>
              <h2 className="mt-2 text-lg font-semibold text-foreground">
                {service.name}
              </h2>
              <p className="mt-3 flex-1 text-sm leading-6 text-muted">
                {service.description ?? "暂无描述"}
              </p>
              <div className="mt-5 flex items-end justify-between gap-2">
                <div>
                  <p className="text-xs text-muted">每次消耗</p>
                  <p className="text-xl font-semibold text-accent">
                    {service.tokenCost === 0
                      ? "免费"
                      : `${service.tokenCost} Token`}
                  </p>
                </div>
                <span className="rounded-xl bg-accent px-3 py-2 text-xs font-semibold text-[#042f2e]">
                  {selectingId === service.id ? "进入中..." : "选择"}
                </span>
              </div>
            </motion.button>
          ))}
        </div>

        {services.length === 0 && !error && (
          <p className="mt-10 text-center text-sm text-muted">
            暂无可用 AI 服务，请联系管理员。
          </p>
        )}
      </div>
    </div>
  );
}
