"use client";

import type { ReactNode } from "react";
import { memo } from "react";
import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { MarkdownCode } from "@/components/chat/CodeBlock";
import styles from "./chat.module.css";

type Props = {
  content: string;
};

function MarkdownLink({
  href,
  children,
}: {
  href?: string;
  children?: ReactNode;
}) {
  if (!href) {
    return <span>{children}</span>;
  }

  return (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}

const components: Components = {
  // CodeBlock 自带 pre；避免双重包裹破坏样式
  pre: ({ children }) => <>{children}</>,
  code: MarkdownCode,
  a: ({ href, children }) => (
    <MarkdownLink href={href}>{children}</MarkdownLink>
  ),
  table: ({ children }) => (
    <div className="md-table-scroll">
      <table>{children}</table>
    </div>
  ),
};

/** 仅在消息完成后使用；流式阶段由 MessageList 纯文本渲染 */
export const ChatMarkdown = memo(function ChatMarkdown({ content }: Props) {
  if (!content) return null;

  return (
    <div className={`markdown-body ${styles.chatMarkdown}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
});
