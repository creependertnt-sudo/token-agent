"use client";

import { motion } from "framer-motion";
import { getServiceUiLabel } from "@/lib/constants";
import { ChatAvatar, MessageItem } from "./ChatMessage";

type Props = {
  serviceType?: string | null;
  modelName?: string | null;
};

export function TypingIndicator({ serviceType, modelName }: Props) {
  const type = serviceType?.trim() || null;
  const name =
    getServiceUiLabel(type, "") ||
    modelName?.trim() ||
    null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 4 }}
      transition={{ duration: 0.2 }}
      className="chat-row chat-row-assistant"
    >
      <MessageItem
        role="assistant"
        avatar={<ChatAvatar variant="ai">AI</ChatAvatar>}
        header={
          <div className="assistant-header-stack">
            <div className="assistant-header-top">
              <span className="msg-name">Mira AI</span>
            </div>
            {name ? (
              <div className="assistant-header-meta">
                <span className="msg-chip">{name}</span>
              </div>
            ) : null}
          </div>
        }
      >
        <div className="bubble bubble-ai inline-flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            {[0, 1, 2].map((i) => (
              <motion.span
                key={i}
                className="h-2 w-2 rounded-full bg-accent"
                animate={{
                  opacity: [0.25, 1, 0.25],
                  y: [0, -3, 0],
                }}
                transition={{
                  duration: 0.85,
                  repeat: Infinity,
                  delay: i * 0.16,
                  ease: "easeInOut",
                }}
              />
            ))}
          </div>
          <span className="text-xs text-muted">正在回复...</span>
        </div>
      </MessageItem>
    </motion.div>
  );
}
