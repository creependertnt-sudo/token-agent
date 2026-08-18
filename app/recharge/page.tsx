"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";
import { authFetch } from "@/lib/client-auth";

type Product = {
  id: string;
  name: string;
  tokenAmount: number;
  price: number;
};

type PendingOrder = {
  id: string;
  productId: string;
  productName: string;
  tokenAmount: number;
  amount: number;
  status: string;
};

export default function RechargePage() {
  const { user, loading: authLoading, setUser } = useAuth({ requireAuth: true });
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [buyingId, setBuyingId] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const [pendingOrder, setPendingOrder] = useState<PendingOrder | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const highlightRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("package");
    setHighlightId(id);
    setSelectedId(id);
    if (id) {
      void authFetch("/api/sales/conversions/click", {
        method: "POST",
        body: JSON.stringify({ packageId: id }),
      }).catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    if (authLoading || !user) return;

    async function load() {
      try {
        const packagesRes = await authFetch("/api/packages");
        const packagesData: { packages?: Product[] } = await packagesRes.json();
        setProducts(packagesData.packages ?? []);
      } catch {
        setError("加载失败，请刷新重试。");
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [authLoading, user]);

  const orderedProducts = useMemo(() => {
    if (!highlightId) return products;
    const hit = products.find((p) => p.id === highlightId);
    if (!hit) return products;
    return [hit, ...products.filter((p) => p.id !== highlightId)];
  }, [products, highlightId]);

  useEffect(() => {
    if (!highlightId || loading) return;
    highlightRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  }, [highlightId, loading, products]);

  async function handleBuy(productId: string) {
    setBuyingId(productId);
    setError(null);
    setMessage(null);

    try {
      const response = await authFetch("/api/orders", {
        method: "POST",
        body: JSON.stringify({ packageId: productId }),
      });

      const data: {
        error?: string;
        order?: PendingOrder;
      } = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "创建订单失败");
      }

      if (data.order) {
        setPendingOrder(data.order);
        setMessage(
          `订单已创建（待支付）：${data.order.productName}，请确认支付。`,
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建订单失败");
    } finally {
      setBuyingId(null);
    }
  }

  async function handlePaySuccess() {
    if (!pendingOrder) return;
    setPaying(true);
    setError(null);
    setMessage(null);

    try {
      const response = await authFetch(`/api/orders/${pendingOrder.id}/pay`, {
        method: "POST",
      });

      const data: {
        error?: string;
        message?: string;
        order?: PendingOrder;
        user?: {
          id: string;
          email: string;
          tokenBalance: number;
          freeChatCount: number;
        };
      } = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "支付失败");
      }

      if (data.user) setUser(data.user);
      setPendingOrder(null);
      setMessage(
        data.message ??
          `支付成功，已到账 ${data.order?.tokenAmount?.toLocaleString()} Token`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "支付失败");
    } finally {
      setPaying(false);
    }
  }

  if (authLoading || !user || loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background text-sm text-muted">
        加载中...
      </div>
    );
  }

  return (
    <div className="relative h-screen overflow-y-auto bg-background px-4 py-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(45,212,191,0.12),transparent_30%)]" />

      <div className="relative mx-auto w-full max-w-4xl">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-[11px] tracking-[0.18em] text-accent uppercase">
              Recharge
            </p>
            <h1 className="mt-1 text-2xl font-semibold text-foreground">
              购买 Token
            </h1>
            <p className="mt-2 text-sm text-muted">
              Token 为 AI 服务额度；创建订单后模拟支付成功即可到账。
              {highlightId
                ? " 销售顾问已为你标出推荐套餐。"
                : ""}
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
              href="/"
              className="rounded-xl border border-panel-border px-4 py-2.5 text-sm text-muted hover:text-foreground"
            >
              返回客服
            </Link>
          </div>
        </div>

        {message && (
          <p className="mb-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
            {message}
          </p>
        )}
        {error && (
          <p className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </p>
        )}

        {pendingOrder && (
          <div className="mb-6 rounded-3xl border border-accent/40 bg-panel p-5">
            <p className="text-xs tracking-[0.16em] text-accent uppercase">
              Pending Order
            </p>
            <h2 className="mt-2 text-lg font-semibold text-foreground">
              待支付：{pendingOrder.productName}
            </h2>
            <p className="mt-2 text-sm text-muted">
              {pendingOrder.tokenAmount.toLocaleString()} Token · ¥
              {Number(pendingOrder.amount).toFixed(2)} · 状态{" "}
              {pendingOrder.status}
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                disabled={paying}
                onClick={() => void handlePaySuccess()}
                className="rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-[#042f2e] transition hover:brightness-110 disabled:opacity-50"
              >
                {paying ? "支付中..." : "支付成功"}
              </button>
              <button
                type="button"
                disabled={paying}
                onClick={() => {
                  setPendingOrder(null);
                  setMessage(null);
                }}
                className="rounded-xl border border-panel-border px-5 py-2.5 text-sm text-muted hover:text-foreground"
              >
                取消
              </button>
            </div>
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-3">
          {orderedProducts.map((product, index) => {
            const recommended = highlightId === product.id;
            const selected = selectedId === product.id;
            return (
            <motion.div
              key={product.id}
              ref={recommended ? highlightRef : undefined}
              id={`package-${product.id}`}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.06 }}
              onClick={() => setSelectedId(product.id)}
              className={`rounded-3xl border bg-panel p-5 shadow-xl ${
                selected || recommended
                  ? "border-accent ring-2 ring-accent/30"
                  : "border-panel-border"
              }`}
            >
              <p className="text-[11px] tracking-[0.16em] text-accent uppercase">
                {recommended ? "Recommended" : selected ? "Selected" : "Package"}
              </p>
              <h2 className="mt-2 text-xl font-semibold text-foreground">
                {product.name}
              </h2>
              <p className="mt-3 text-3xl font-semibold text-accent">
                {product.tokenAmount.toLocaleString()}
                <span className="ml-1 text-sm font-medium text-muted">Token</span>
              </p>
              <p className="mt-4 text-2xl font-semibold text-foreground">
                ¥{Number(product.price).toFixed(2)}
              </p>
              <button
                type="button"
                disabled={buyingId === product.id || !!pendingOrder}
                onClick={() => void handleBuy(product.id)}
                className="mt-6 w-full rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-[#042f2e] transition hover:brightness-110 disabled:opacity-50"
              >
                {buyingId === product.id
                  ? "下单中..."
                  : `立即购买【${product.name}】`}
              </button>
            </motion.div>
            );
          })}
        </div>

        {products.length === 0 && (
          <p className="mt-8 text-center text-sm text-muted">暂无套餐，请稍后重试。</p>
        )}
      </div>
    </div>
  );
}
