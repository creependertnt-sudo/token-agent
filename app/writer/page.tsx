"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { motion } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { FEATURE_TOKEN_COST } from "@/lib/constants";
import { useAuth } from "@/hooks/useAuth";
import { authFetch } from "@/lib/client-auth";

export default function WriterPage() {
  const { user, loading: authLoading, setUser } = useAuth({ requireAuth: true });
  const [productInfo, setProductInfo] = useState("");
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!productInfo.trim() || loading || !user) return;

    setLoading(true);
    setError(null);

    try {
      const response = await authFetch("/api/writer", {
        method: "POST",
        body: JSON.stringify({ productInfo }),
      });

      const data: {
        error?: string;
        message?: string;
        content?: string;
        tokenBalance?: number;
        freeChatCount?: number;
        cost?: number;
      } = await response.json();

      if (response.status === 402) {
        setError(
          data.message ??
            `Token 不足（需要 ${FEATURE_TOKEN_COST.writing}），请先购买套餐。`,
        );
        return;
      }

      if (!response.ok) {
        throw new Error(
          data.error === "RATE_LIMITED"
            ? (data.message ?? "请求过于频繁，请稍后再试。")
            : (data.error ?? data.message ?? "生成失败"),
        );
      }

      setResult(data.content ?? "");
      if (typeof data.tokenBalance === "number") {
        setUser({
          ...user,
          tokenBalance: data.tokenBalance,
          freeChatCount:
            typeof data.freeChatCount === "number"
              ? data.freeChatCount
              : user.freeChatCount,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "生成失败");
    } finally {
      setLoading(false);
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

      <div className="relative mx-auto w-full max-w-3xl">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-[11px] tracking-[0.18em] text-accent uppercase">
              Writer
            </p>
            <h1 className="mt-1 text-2xl font-semibold text-foreground">
              AI 写作助手
            </h1>
            <p className="mt-2 text-sm text-muted">
              生成营销文案、销售方案、产品介绍与广告标题。每次消耗{" "}
              {FEATURE_TOKEN_COST.writing} Token。
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="rounded-2xl border border-panel-border bg-panel px-4 py-3 text-sm">
              <p className="text-xs text-muted">当前余额</p>
              <p className="font-semibold text-accent">
                {user.tokenBalance.toLocaleString()} Token
              </p>
            </div>
            <Link
              href="/recharge"
              className="rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-[#042f2e]"
            >
              充值
            </Link>
            <Link
              href="/"
              className="rounded-xl border border-panel-border px-4 py-2.5 text-sm text-muted hover:text-foreground"
            >
              返回客服
            </Link>
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-3xl border border-panel-border bg-panel p-5"
        >
          <label className="text-sm font-medium text-foreground">
            产品信息
          </label>
          <textarea
            value={productInfo}
            onChange={(e) => setProductInfo(e.target.value)}
            rows={6}
            placeholder="例如：产品名、核心卖点、目标客群、价格与活动…"
            className="mt-2 w-full rounded-2xl border border-panel-border bg-card px-4 py-3 text-sm text-foreground outline-none focus:border-accent/50"
          />
          {error && (
            <p className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-300">
              {error}
              {error.includes("不足") && (
                <>
                  {" "}
                  <Link href="/recharge" className="underline text-accent">
                    去购买 Token
                  </Link>
                </>
              )}
            </p>
          )}
          <motion.button
            type="submit"
            whileTap={{ scale: 0.98 }}
            disabled={loading || !productInfo.trim()}
            className="mt-4 rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-[#042f2e] disabled:opacity-50"
          >
            {loading
              ? "生成中..."
              : `生成内容（消耗 ${FEATURE_TOKEN_COST.writing} Token）`}
          </motion.button>
        </form>

        {result && (
          <div className="mt-6 rounded-3xl border border-panel-border bg-panel p-5 prose prose-invert max-w-none prose-sm">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{result}</ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}
