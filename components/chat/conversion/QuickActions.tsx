"use client";

import { useEffect, useState } from "react";
import type { QuickAction } from "@/components/chat/types";
import type { ChatServiceType } from "@/lib/constants";
import type { QuickSendOptions } from "@/lib/quick-send";
import styles from "./chat.module.css";

const MAX_ACTIONS = 3;
const EXIT_MS = 120;

type Props = {
  messageId: string;
  actions: QuickAction[];
  usedActions?: boolean;
  /** 推进链 id：跟进时带给后端 */
  chainId?: string;
  disabled?: boolean;
  onQuickSend: (text: string, opts?: QuickSendOptions) => void;
};

/** AI 气泡下方的消息附属操作区（不属于气泡正文） */
export function QuickActions({
  messageId,
  actions,
  usedActions,
  chainId,
  disabled,
  onQuickSend,
}: Props) {
  const [phase, setPhase] = useState<"in" | "out" | "gone">(
    usedActions ? "gone" : "in",
  );

  useEffect(() => {
    if (!usedActions) return;

    setPhase("out");

    const t = window.setTimeout(() => {
      setPhase("gone");
    }, EXIT_MS);

    return () => clearTimeout(t);
  }, [usedActions]);

  if (phase === "gone") return null;

  const limited = actions.slice(0, MAX_ACTIONS);
  if (limited.length === 0) return null;

  return (
    <div
      className={styles.messageAccessory}
      data-message-id={messageId}
      role="group"
      aria-label="下一步"
    >
      <div
        className={styles.quickActions}
        data-exiting={phase === "out" || undefined}
      >
        {limited.map((action) => (
          <button
            key={action.id}
            type="button"
            className={styles.quickActionBtn}
            disabled={disabled || phase === "out"}
            onClick={() => {
              const opts: QuickSendOptions = {
                messageId,
                actionChainContinue: true,
                chainId,
                ...(action.suggestServiceType
                  ? {
                      serviceType:
                        action.suggestServiceType as ChatServiceType,
                    }
                  : {}),
              };
              onQuickSend(action.prompt || action.label, opts);
            }}
          >
            {action.label} →
          </button>
        ))}
      </div>
    </div>
  );
}
