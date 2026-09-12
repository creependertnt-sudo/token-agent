"use client";

import type { ProductSuggestion } from "@/components/chat/types";
import styles from "./chat.module.css";

type PackageLike = ProductSuggestion & {
  description?: string | null;
};

type Props = {
  product: PackageLike;
  disabled?: boolean;
  onBuy: (product: ProductSuggestion) => void;
  onRecommend?: () => void;
};

function scenariosFor(product: PackageLike): string[] {
  if (product.tokenAmount >= 80000) {
    return ["长时间连续调试", "高频多轮对话", "复杂任务拆解"];
  }
  if (product.tokenAmount >= 30000) {
    return ["连续调试项目", "多轮对话", "日常开发协作"];
  }
  return ["快速验证想法", "短对话试跑", "轻量体验付费通道"];
}

export function PackageCard({ product, disabled, onBuy, onRecommend }: Props) {
  const scenarios = scenariosFor(product);

  return (
    <div className={styles.packageCard}>
      <h4 className={styles.packageName}>{product.name}</h4>
      <p className={styles.packageTokens}>
        {product.tokenAmount.toLocaleString()} Token · ¥{product.price.toFixed(2)}
      </p>
      <p className={styles.packagePrice}>¥{product.price.toFixed(2)}</p>
      <div className={styles.packageAudience}>
        <p className={styles.packageAudienceLabel}>适合：</p>
        <ul className={styles.packageScenarioList}>
          {scenarios.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        {product.description?.trim() ? (
          <p className={styles.packageAudienceExtra}>{product.description.trim()}</p>
        ) : null}
      </div>
      <div className={styles.packageActions}>
        <button
          type="button"
          className={styles.packageBuy}
          disabled={disabled}
          onClick={() => onBuy(product)}
        >
          立即购买
        </button>
        {onRecommend ? (
          <button
            type="button"
            className={styles.packageRecommend}
            disabled={disabled}
            onClick={onRecommend}
          >
            推荐我一个
          </button>
        ) : null}
      </div>
    </div>
  );
}
