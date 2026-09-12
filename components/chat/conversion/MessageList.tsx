"use client";

import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import type {
  AuthUser,
  ChatMessage,
  ProductSuggestion,
  QuickAction,
  SoftRecommend,
} from "@/components/chat/types";
import { generateQuickActions } from "@/lib/quick-actions";
import {
  STARTER_BUNDLE_FALLBACK,
  formatStarterDisplayLabel,
  type QuickSendOptions,
  type StarterBundle,
} from "@/lib/quick-send";
import { PackageCard } from "./PackageCard";
import { ChatMarkdown } from "./ChatMarkdown";
import { MessageMenu, type MessageMenuAction } from "./MessageMenu";
import { SoftRecommendCard } from "./SoftRecommendCard";
import { QuickActions } from "./QuickActions";
import {
  hasUnclosedFenceOrLink,
  unescapeAfterStream,
} from "@/lib/markdown-stream";
import styles from "./chat.module.css";

/**
 * A 补丁：流式绝不走 ChatMarkdown；完成态一次性 unescape 后渲染。
 * - streaming：纯文本 / 未闭合 fence 用 <pre>（展示可读文本）
 * - done：unescape → ChatMarkdown（唯一解析入口）
 */
function StreamSafeContent({
  content,
  streaming,
}: {
  content: string;
  streaming?: boolean;
}) {
  if (streaming) {
    // 存盘可能是 escape 后的占位；给人看时还原。绝不调用 ChatMarkdown。
    const readable = unescapeAfterStream(content ?? "");
    const showAsCode = hasUnclosedFenceOrLink(content ?? "");
    if (showAsCode) {
      return (
        <pre className={styles.streamCode} aria-live="polite">
          {readable}
          <span className={styles.streamCaret} aria-hidden />
        </pre>
      );
    }
    return (
      <div className={styles.streamPlain} aria-live="polite">
        {readable}
        <span className={styles.streamCaret} aria-hidden />
      </div>
    );
  }

  const finalText = unescapeAfterStream(content ?? "");
  return <ChatMarkdown content={finalText} />;
}

type ListHandlers = {
  /**
   * 统一一键发送（page.handleQuickSend）。
   * 点击推荐按钮必须走这里 → 直接 sendMessage，禁止填 input。
   */
  onQuickSend: (text: string, opts?: QuickSendOptions) => void;
  onBuy: (product: ProductSuggestion) => void;
  onRecommendPackage?: () => void;
  onBuyPrimary?: () => void;
  onSwitchToStandard?: () => void;
  /** 软推荐行动（可切模型 + 发送） */
  onSoftRecommendAction?: (tip: SoftRecommend) => void;
  /** 消息菜单：置顶 / 复制 / 重新生成（消息级） */
  onMessageAction?: (messageId: string, action: MessageMenuAction) => void;
};

type Props = {
  messages: ChatMessage[];
  user: AuthUser;
  listRef: RefObject<HTMLDivElement | null>;
  busy?: boolean;
  /** 新对话空态推荐（分层：主 / 次 / 探索） */
  starterSends?: StarterBundle;
} & ListHandlers;

/** 与 Sidebar 一致：昵称优先，否则邮箱首字 */
function userAvatarLabel(user: AuthUser): string {
  const custom = user.avatar?.trim();
  if (custom && custom.length <= 4 && !/^https?:\/\//i.test(custom)) {
    return custom.slice(0, 2);
  }
  const raw = (user.nickname || user.email || "?").trim();
  const ch = raw[0];
  return ch ? ch.toUpperCase() : "?";
}

function AiAvatar() {
  return (
    <div className={styles.msgAvatar} data-variant="ai" aria-hidden>
      <span className={styles.msgAvatarMark}>✦</span>
    </div>
  );
}

function UserAvatar({ label }: { label: string }) {
  return (
    <div className={styles.msgAvatar} data-variant="user" aria-hidden>
      <span className={styles.msgAvatarMark}>{label}</span>
    </div>
  );
}

function resolveQuickActions(message: ChatMessage): QuickAction[] {
  if (message.showQuickActions === false) return [];
  if (message.quickActions && message.quickActions.length > 0) {
    return message.quickActions;
  }
  if (!message.content?.trim() || message.serviceType === "SALES") return [];
  // 旧消息兜底：仍走统一生成入口
  return generateQuickActions({
    lastUserMessage: "",
    lastAssistantMessage: message.content,
    messageCount: 1,
    serviceType: message.serviceType,
  });
}

type MessageProps = {
  message: ChatMessage;
  userLabel: string;
  hideWelcome: boolean;
  busy?: boolean;
  starterSends?: StarterBundle;
} & ListHandlers;

function MessageShell({
  messageId,
  pinned,
  align = "end",
  variant = "assistant",
  menuDisabled,
  children,
  onMenuAction,
}: {
  messageId: string;
  pinned?: boolean;
  /** 整条消息 hover：⋯ 右上（用户 / AI 统一） */
  align?: "start" | "end";
  variant?: "assistant" | "user";
  menuDisabled?: boolean;
  children: ReactNode;
  onMenuAction?: (action: MessageMenuAction) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [messageHover, setMessageHover] = useState(false);
  const [menuHover, setMenuHover] = useState(false);
  const leaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isHovering = messageHover || menuHover;
  const toolbarVisible = isHovering || menuOpen;

  function clearLeaveTimer() {
    if (leaveTimerRef.current != null) {
      clearTimeout(leaveTimerRef.current);
      leaveTimerRef.current = null;
    }
  }

  function onMessageEnter() {
    clearLeaveTimer();
    setMessageHover(true);
  }

  function onMessageLeave() {
    // 给鼠标移向 fixed 菜单留一条短暂通道，避免 hover 断裂
    clearLeaveTimer();
    leaveTimerRef.current = setTimeout(() => {
      setMessageHover(false);
      leaveTimerRef.current = null;
    }, 80);
  }

  function onMenuHoverChange(next: boolean) {
    if (next) {
      clearLeaveTimer();
      setMenuHover(true);
      return;
    }
    setMenuHover(false);
  }

  useEffect(() => {
    return () => clearLeaveTimer();
  }, []);

  return (
    <div
      className={`${styles.messageWrapper}${pinned ? ` ${styles.pinned}` : ""}`}
      data-message-id={messageId}
      data-align={align}
      data-menu-open={menuOpen || undefined}
      data-toolbar-visible={toolbarVisible || undefined}
      data-pinned={pinned || undefined}
      onMouseEnter={onMessageEnter}
      onMouseLeave={onMessageLeave}
    >
      {pinned ? (
        <span className={styles.pinBadge} aria-label="已置顶" title="已置顶">
          📌
        </span>
      ) : null}
      <div
        className={styles.messageToolbar}
        data-align={align}
        data-visible={toolbarVisible || undefined}
        data-menu-open={menuOpen || undefined}
      >
        <MessageMenu
          pinned={pinned}
          variant={variant}
          align={align}
          disabled={menuDisabled}
          onOpenChange={setMenuOpen}
          onHoverChange={onMenuHoverChange}
          onAction={onMenuAction}
        />
      </div>
      {children}
    </div>
  );
}

function MessageView({
  message,
  userLabel,
  hideWelcome,
  busy,
  starterSends,
  onQuickSend,
  onBuy,
  onRecommendPackage,
  onBuyPrimary,
  onSwitchToStandard,
  onSoftRecommendAction,
  onMessageAction,
}: MessageProps) {
  if (message.role === "system") {
    return (
      <div className={`${styles.message} ${styles.rowSystem} ${styles.bubbleEnter}`}>
        <p className={styles.bubbleSystem}>{message.content}</p>
      </div>
    );
  }

  if (message.role === "user") {
    return (
      <MessageShell
        messageId={message.id}
        pinned={message.pinned}
        align="end"
        variant="user"
        menuDisabled={busy}
        onMenuAction={
          onMessageAction
            ? (action) => onMessageAction(message.id, action)
            : undefined
        }
      >
        <div className={`${styles.message} ${styles.rowUser} ${styles.bubbleEnter}`}>
          <div className={styles.bubbleUser}>{message.content}</div>
          <UserAvatar label={userLabel} />
        </div>
      </MessageShell>
    );
  }

  if (message.id === "welcome") {
    if (hideWelcome) return null;
    const bundle = starterSends ?? STARTER_BUNDLE_FALLBACK;
    return (
      <div className={`${styles.message} ${styles.rowWelcome} ${styles.bubbleEnter}`}>
        <div className={styles.emptyState}>
          <p className={styles.emptySecondary}>你可以从这些开始 👇</p>
          <div className={styles.starterSends} aria-label="你可以从这些开始">
            <div className={styles.starterPrimary} role="group" aria-label="主推荐">
              <p className={styles.starterPrimaryHint}>建议下一步</p>
              <button
                type="button"
                className={styles.starterPrimaryBtn}
                disabled={busy}
                onClick={() => {
                  onQuickSend(bundle.primary.prompt || bundle.primary.label, {
                    chainId: bundle.primary.chainId,
                    starterId: bundle.primary.id,
                    starterCategory: bundle.primary.category,
                  });
                }}
              >
                {formatStarterDisplayLabel(bundle.primary.label)}
              </button>
            </div>

            {bundle.secondary.length > 0 ? (
              <div
                className={styles.starterSecondary}
                role="group"
                aria-label="次推荐"
              >
                {bundle.secondary.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={styles.starterSecondaryBtn}
                    disabled={busy}
                    onClick={() => {
                      onQuickSend(item.prompt || item.label, {
                        chainId: item.chainId,
                        starterId: item.id,
                        starterCategory: item.category,
                      });
                    }}
                  >
                    {formatStarterDisplayLabel(item.label)}
                  </button>
                ))}
              </div>
            ) : null}

            {bundle.explore.length > 0 ? (
              <div className={styles.starterExplore} role="group" aria-label="探索">
                <p className={styles.starterExploreLabel}>探索</p>
                <div className={styles.starterExploreList}>
                  {bundle.explore.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={styles.starterExploreBtn}
                      disabled={busy}
                      onClick={() => {
                        onQuickSend(item.prompt || item.label, {
                          chainId: item.chainId,
                          starterId: item.id,
                          starterCategory: item.category,
                        });
                      }}
                    >
                      {formatStarterDisplayLabel(item.label)}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  const isSales = message.serviceType === "SALES";
  const bubbleClass = isSales ? styles.bubbleSales : styles.bubbleAssistant;
  const done =
    !message.streaming && !message.thinking && Boolean(message.content);
  const guidanceActions =
    !isSales && done && message.showQuickActions !== false
      ? resolveQuickActions(message)
      : [];
  const showGuidance = guidanceActions.length > 0;

  return (
    <MessageShell
      messageId={message.id}
      pinned={message.pinned}
      align="end"
      variant="assistant"
      menuDisabled={busy || message.streaming || message.thinking}
      onMenuAction={
        onMessageAction
          ? (action) => onMessageAction(message.id, action)
          : undefined
      }
    >
      <div className={`${styles.message} ${styles.rowAssistant} ${styles.bubbleEnter}`}>
        <AiAvatar />
        <div className={styles.msgCol}>
          <span className={styles.msgName}>Mira AI</span>
          <div className={bubbleClass}>
            {message.memoryHint ? (
              <p className={styles.memoryHint}>{message.memoryHint}</p>
            ) : null}

            {isSales ? <div className={styles.salesTag}>Guide（免费）</div> : null}

            {message.thinking && !message.content ? (
              <span className="text-muted">…</span>
            ) : (
              <StreamSafeContent
                content={message.content}
                streaming={message.streaming}
              />
            )}

            {message.products && message.products.length > 0 ? (
              <div className={styles.packageGrid}>
                {message.products.map((product) => (
                  <PackageCard
                    key={product.id}
                    product={product}
                    onBuy={onBuy}
                    onRecommend={onRecommendPackage}
                    disabled={busy}
                  />
                ))}
              </div>
            ) : null}
          </div>

          {/* 消息附属区：不属于气泡正文 */}
          {isSales && done ? (
            <div className={styles.messageAccessory} role="group" aria-label="购买引导">
              <div className={styles.quickActions}>
                <button
                  type="button"
                  className={styles.salesCta}
                  disabled={busy}
                  onClick={onBuyPrimary}
                >
                  立即购买
                </button>
                {onSwitchToStandard ? (
                  <button
                    type="button"
                    className={styles.cta}
                    disabled={busy}
                    onClick={onSwitchToStandard}
                  >
                    先试试 Beta
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}

          {showGuidance ? (
            <QuickActions
              messageId={message.id}
              actions={guidanceActions}
              usedActions={message.usedActions}
              chainId={message.chainMeta?.chainId}
              disabled={busy}
              onQuickSend={onQuickSend}
            />
          ) : null}

          {done && message.softRecommend ? (
            <div className={styles.messageAccessory}>
              <SoftRecommendCard
                tip={message.softRecommend}
                disabled={busy}
                onAction={onSoftRecommendAction}
              />
            </div>
          ) : null}
        </div>
      </div>
    </MessageShell>
  );
}

/** 消息行隔离：message 引用不变则跳过重渲染 */
const Message = memo(MessageView);

export function MessageList({
  messages,
  user,
  listRef,
  busy,
  starterSends,
  onQuickSend,
  onBuy,
  onRecommendPackage,
  onBuyPrimary,
  onSwitchToStandard,
  onSoftRecommendAction,
  onMessageAction,
}: Props) {
  const hasUserMessage = messages.some((m) => m.role === "user");
  const userLabel = userAvatarLabel(user);

  const handlersRef = useRef<ListHandlers>({
    onQuickSend,
    onBuy,
    onRecommendPackage,
    onBuyPrimary,
    onSwitchToStandard,
    onSoftRecommendAction,
    onMessageAction,
  });
  handlersRef.current = {
    onQuickSend,
    onBuy,
    onRecommendPackage,
    onBuyPrimary,
    onSwitchToStandard,
    onSoftRecommendAction,
    onMessageAction,
  };

  const stableQuickSend = useCallback(
    (text: string, opts?: QuickSendOptions) => {
      handlersRef.current.onQuickSend(text, opts);
    },
    [],
  );
  const stableBuy = useCallback((product: ProductSuggestion) => {
    handlersRef.current.onBuy(product);
  }, []);
  const stableRecommend = useCallback(() => {
    handlersRef.current.onRecommendPackage?.();
  }, []);
  const stableBuyPrimary = useCallback(() => {
    handlersRef.current.onBuyPrimary?.();
  }, []);
  const stableSwitch = useCallback(() => {
    handlersRef.current.onSwitchToStandard?.();
  }, []);
  const stableSoftAction = useCallback((tip: SoftRecommend) => {
    handlersRef.current.onSoftRecommendAction?.(tip);
  }, []);
  const stableMessageAction = useCallback(
    (messageId: string, action: MessageMenuAction) => {
      handlersRef.current.onMessageAction?.(messageId, action);
    },
    [],
  );

  return (
    <div className={styles.list} ref={listRef}>
      {messages.map((message) => (
        <Message
          key={message.id}
          message={message}
          userLabel={userLabel}
          hideWelcome={message.id === "welcome" ? hasUserMessage : false}
          busy={busy}
          starterSends={
            message.id === "welcome" ? starterSends : undefined
          }
          onQuickSend={stableQuickSend}
          onBuy={stableBuy}
          onRecommendPackage={
            onRecommendPackage ? stableRecommend : undefined
          }
          onBuyPrimary={onBuyPrimary ? stableBuyPrimary : undefined}
          onSwitchToStandard={
            onSwitchToStandard ? stableSwitch : undefined
          }
          onSoftRecommendAction={
            onSoftRecommendAction ? stableSoftAction : undefined
          }
          onMessageAction={
            onMessageAction ? stableMessageAction : undefined
          }
        />
      ))}
    </div>
  );
}
