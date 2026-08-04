"use client";

import type { ReactNode } from "react";

type MessageItemProps = {
  role: "user" | "assistant";
  avatar: ReactNode;
  header: ReactNode;
  children: ReactNode;
};

/**
 * ChatGPT / Discord 紧凑消息骨架：
 * [头像] 名称行（与头像顶部水平对齐）
 *        气泡（紧贴名称下，靠近头像，无纵向错位）
 */
export function MessageItem({ role, avatar, header, children }: MessageItemProps) {
  const isUser = role === "user";

  return (
    <div className={isUser ? "user-message" : "assistant-message"}>
      <div className="avatar shrink-0 self-start">{avatar}</div>
      <div className={isUser ? "user-content" : "assistant-content"}>
        <div className={isUser ? "user-header" : "assistant-header"}>
          {header}
        </div>
        {children}
      </div>
    </div>
  );
}

export function ChatAvatar({
  children,
  variant,
}: {
  children: ReactNode;
  variant: "ai" | "user";
}) {
  const tone =
    variant === "ai"
      ? "bg-gradient-to-br from-teal-400 to-cyan-600 text-[#042f2e]"
      : "bg-gradient-to-br from-slate-200 to-slate-400 text-slate-900";

  return (
    <div
      className={`flex h-full w-full items-center justify-center rounded-full text-[11px] font-bold leading-none ${tone}`}
    >
      {children}
    </div>
  );
}

/** @deprecated */
export function ChatMessageLayout(props: {
  align: "start" | "end";
  avatar: ReactNode;
  header: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <MessageItem
      role={props.align === "end" ? "user" : "assistant"}
      avatar={props.avatar}
      header={props.header}
    >
      {props.children}
    </MessageItem>
  );
}

/** @deprecated */
export function ChatAvatarShell(props: {
  children: ReactNode;
  variant: "ai" | "user";
}) {
  return <ChatAvatar {...props} />;
}
