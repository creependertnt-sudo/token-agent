"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ChatAvatar, MessageItem } from "./ChatMessage";
import { MarkdownCode } from "./CodeBlock";
import { ProductCard } from "./ProductCard";
import { formatTime } from "./parseProducts";
import type { ChatMessage, ProductSuggestion } from "./types";
import { avatarInitials, displayNickname } from "@/lib/user-profile";
import {
  resolveMessageSnapshot,
  stripAssistantDisplayMeta,
} from "@/lib/message-snapshot";

type Props = {
  message: ChatMessage;
  onBuy: (product: ProductSuggestion) => void;
  buyDisabled?: boolean;
  userNickname?: string | null;
  userAvatar?: string | null;
};

function TokenCostStatus({
  tokenCost,
  balance,
  serviceType,
  modelName,
}: {
  tokenCost: number;
  balance: number | null;
  serviceType: string | null;
  modelName: string | null;
}) {
  const [open, setOpen] = useState(false);
  const hasDetails =
    balance !== null || Boolean(serviceType) || Boolean(modelName);

  return (
    <div className="msg-cost-status">
      <button
        type="button"
        className="msg-cost-toggle"
        onClick={() => hasDetails && setOpen((v) => !v)}
        aria-expanded={hasDetails ? open : undefined}
        disabled={!hasDetails}
      >
        <span>已消耗 {tokenCost} Token</span>
        {hasDetails ? (
          <span className="msg-cost-caret" aria-hidden>
            {open ? "▾" : "▸"}
          </span>
        ) : null}
      </button>
      {open && hasDetails ? (
        <div className="msg-cost-detail">
          {balance !== null ? (
            <span>余额 {balance.toLocaleString()} Token</span>
          ) : null}
          {serviceType ? <span>{serviceType}</span> : null}
          {modelName ? <span>{modelName}</span> : null}
        </div>
      ) : null}
    </div>
  );
}

export function MessageBubble({
  message,
  onBuy,
  buyDisabled,
  userNickname,
  userAvatar,
}: Props) {
  const isUser = message.role === "user";
  const time = formatTime(message.createdAt);
  const nickname = displayNickname(userNickname);
  const avatarLabel = userAvatar?.trim() || avatarInitials(userNickname);

  // 历史/新消息统一走消息快照字段，禁止用顶部当前选择覆盖
  const snap = resolveMessageSnapshot({
    serviceType: message.serviceType,
    modelName: message.modelName,
    tokenCost: message.tokenCost,
    tokenBalanceAfter: message.tokenBalanceAfter,
    content: message.content,
  });

  const body = stripAssistantDisplayMeta(message.content);

  const balance =
    typeof message.tokenBalanceAfter === "number"
      ? message.tokenBalanceAfter
      : typeof snap.tokenBalanceAfter === "number"
        ? snap.tokenBalanceAfter
        : null;

  const showCost =
    message.id !== "welcome" &&
    !message.streaming &&
    !message.thinking &&
    typeof snap.tokenCost === "number";

  if (isUser) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18, ease: "easeOut" }}
        className="chat-row chat-row-user"
      >
        <MessageItem
          role="user"
          avatar={
            <ChatAvatar variant="user">{avatarLabel.slice(0, 2)}</ChatAvatar>
          }
          header={
            <>
              <span className="msg-name">{nickname}</span>
              <span className="msg-time">{time}</span>
            </>
          }
        >
          <div className="bubble bubble-user w-fit max-w-full rounded-[var(--bubble-radius)]">
            <p>{message.content}</p>
          </div>
        </MessageItem>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      className="chat-row chat-row-assistant"
    >
      <MessageItem
        role="assistant"
        avatar={<ChatAvatar variant="ai">AI</ChatAvatar>}
        header={
          <div className="assistant-header-stack">
            <div className="assistant-header-top">
              <span className="msg-name">Token AI客服</span>
              <span className="msg-time">{time}</span>
            </div>
            {/* Token 扣费不进 Header，只在底部状态栏 */}
            <div className="assistant-header-meta">
              <span className="msg-chip" title="API 来源">
                DeepSeek
              </span>
              {snap.serviceType ? (
                <span className="msg-chip" title="serviceType">
                  {snap.serviceType}
                </span>
              ) : null}
              {snap.modelName ? (
                <span className="msg-chip" title="modelName">
                  {snap.modelName}
                </span>
              ) : null}
            </div>
          </div>
        }
      >
        <div className="bubble bubble-ai rounded-[var(--bubble-radius)]">
          {message.thinking && !body.trim() ? (
            <div className="stream-thinking">
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
              <span>AI正在思考...</span>
            </div>
          ) : (
            <div className="markdown-body">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  pre: ({ children }) => <>{children}</>,
                  code: MarkdownCode,
                  table: ({ children }) => (
                    <div className="md-table-scroll">
                      <table>{children}</table>
                    </div>
                  ),
                }}
              >
                {body || " "}
              </ReactMarkdown>
              {message.streaming ? (
                <span className="stream-caret" aria-hidden />
              ) : null}
            </div>
          )}
        </div>

        {showCost ? (
          <TokenCostStatus
            tokenCost={snap.tokenCost as number}
            balance={balance}
            serviceType={snap.serviceType}
            modelName={snap.modelName}
          />
        ) : null}

        {message.products &&
        message.products.length > 0 &&
        !message.streaming ? (
          <div className="mt-2 grid w-full min-w-[min(100%,16rem)] max-w-full gap-2 sm:grid-cols-2">
            {message.products.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                onBuy={onBuy}
                disabled={buyDisabled}
              />
            ))}
          </div>
        ) : null}
      </MessageItem>
    </motion.div>
  );
}
