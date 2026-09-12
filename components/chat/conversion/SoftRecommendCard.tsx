"use client";

import type { SoftRecommend } from "@/components/chat/types";
import styles from "./chat.module.css";

type Props = {
  tip: SoftRecommend;
  disabled?: boolean;
  onAction?: (tip: SoftRecommend) => void;
};

/** 非打断软推荐卡：顾问口吻，无购买 CTA */
export function SoftRecommendCard({ tip, disabled, onAction }: Props) {
  return (
    <div className={styles.softCard} role="note">
      <p className={styles.softCardTitle}>{tip.title}</p>
      {tip.body ? <p className={styles.softCardBody}>{tip.body}</p> : null}
      {tip.actionLabel && tip.actionPrompt && onAction ? (
        <button
          type="button"
          className={styles.softCardAction}
          disabled={disabled}
          onClick={() => onAction(tip)}
        >
          {tip.actionLabel}
        </button>
      ) : null}
    </div>
  );
}
