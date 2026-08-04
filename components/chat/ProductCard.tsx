"use client";

import { motion } from "framer-motion";
import type { ProductSuggestion } from "./types";

type Props = {
  product: ProductSuggestion;
  onBuy: (product: ProductSuggestion) => void;
  disabled?: boolean;
};

export function ProductCard({ product, onBuy, disabled }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.28, ease: "easeOut" }}
      className="overflow-hidden rounded-2xl border border-panel-border bg-gradient-to-br from-[#121a28] to-[#0c121c] shadow-[0_8px_30px_rgba(0,0,0,0.25)]"
    >
      <div className="border-b border-panel-border bg-accent-soft px-4 py-2">
        <p className="text-[11px] font-medium tracking-[0.16em] text-accent uppercase">
          推荐套餐
        </p>
      </div>

      <div className="space-y-3 p-4">
        <div>
          <h4 className="text-base font-semibold text-foreground">
            {product.name}
          </h4>
          <p className="mt-1 text-sm text-muted">
            {product.tokenAmount.toLocaleString()} Token 即时到账
          </p>
        </div>

        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-xs text-muted">价格</p>
            <p className="text-2xl font-semibold text-accent">
              ¥{product.price.toFixed(2)}
            </p>
          </div>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onBuy(product)}
            className="rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-[#042f2e] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            立即购买
          </button>
        </div>
      </div>
    </motion.div>
  );
}
