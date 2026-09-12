"use client";

import { useEffect, useState } from "react";
import type { ProductSuggestion } from "@/components/chat/types";
import styles from "./chat.module.css";

type Props = {
  product: ProductSuggestion | null;
  open: boolean;
  confirming: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

function scenarioLine(product: ProductSuggestion) {
  if (product.tokenAmount >= 80000) return "适合长时间连续调试与高频多轮对话";
  if (product.tokenAmount >= 30000) return "适合连续调试项目与多轮对话";
  return "适合快速验证与轻量体验";
}

export function PurchaseModal({
  product,
  open,
  confirming,
  onConfirm,
  onCancel,
}: Props) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!open || !product) {
      setVisible(false);
      return;
    }
    const id = window.requestAnimationFrame(() => setVisible(true));
    return () => window.cancelAnimationFrame(id);
  }, [open, product]);

  if (!open || !product) return null;

  return (
    <div
      className={styles.modalOverlay}
      data-visible={visible}
      role="dialog"
      aria-modal="true"
      aria-labelledby="purchase-modal-title"
      onClick={confirming ? undefined : onCancel}
    >
      <div
        className={styles.modalCard}
        onClick={(e) => e.stopPropagation()}
      >
        <p className={styles.modalEyebrow}>补充 Token</p>
        <h2 id="purchase-modal-title" className={styles.modalTitle}>
          {product.name}
        </h2>
        <p className={styles.modalTokens}>
          {product.tokenAmount.toLocaleString()} Token
        </p>
        <p className={styles.modalPrice}>¥{product.price.toFixed(2)}</p>
        <p className={styles.modalDesc}>{scenarioLine(product)}</p>
        <p className={styles.modalNote}>
          补充后可以直接接着聊，不用重新输入
        </p>
        <div className={styles.modalActions}>
          <button
            type="button"
            className={styles.modalConfirm}
            disabled={confirming}
            onClick={onConfirm}
          >
            {confirming ? "处理中…" : "确认购买"}
          </button>
          <button
            type="button"
            className={styles.modalCancel}
            disabled={confirming}
            onClick={onCancel}
          >
            取消
          </button>
        </div>
      </div>
    </div>
  );
}
