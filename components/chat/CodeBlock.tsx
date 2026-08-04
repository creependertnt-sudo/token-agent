"use client";

import { useMemo, useState, type HTMLAttributes, type ReactNode } from "react";

const COLLAPSE_LINE_THRESHOLD = 14;

type Props = {
  code: string;
  language?: string | null;
};

function resolveLanguage(raw?: string | null) {
  const lang = raw?.trim().toLowerCase();
  if (!lang) return "text";
  return lang;
}

function nodeToText(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(nodeToText).join("");
  return "";
}

export function CodeBlock({ code, language }: Props) {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const lang = resolveLanguage(language);
  const lineCount = useMemo(
    () => (code.length === 0 ? 0 : code.split("\n").length),
    [code],
  );
  const collapsible = lineCount > COLLAPSE_LINE_THRESHOLD;
  const collapsed = collapsible && !expanded;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div
      className={`md-code-block${collapsed ? " is-collapsed" : ""}`}
      data-language={lang}
    >
      <div className="md-code-toolbar">
        <span className="md-code-lang">{lang}</span>
        <div className="md-code-actions">
          {collapsible ? (
            <button
              type="button"
              className="md-code-btn"
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? "收起" : `展开 ${lineCount} 行`}
            </button>
          ) : null}
          <button
            type="button"
            className="md-code-btn"
            onClick={() => void handleCopy()}
          >
            {copied ? "已复制" : "复制"}
          </button>
        </div>
      </div>
      <pre className="md-code-pre">
        <code>{code}</code>
      </pre>
      {collapsed ? (
        <button
          type="button"
          className="md-code-fade-btn"
          onClick={() => setExpanded(true)}
        >
          展开全部代码
        </button>
      ) : null}
    </div>
  );
}

/** react-markdown 用：区分行内 code 与代码块 */
export function MarkdownCode({
  className,
  children,
  ...props
}: {
  className?: string;
  children?: ReactNode;
} & HTMLAttributes<HTMLElement>) {
  const text = nodeToText(children).replace(/\n$/, "");
  const match = /language-([\w+-]+)/.exec(className || "");
  const isBlock =
    Boolean(match) ||
    className?.includes("language-") === true ||
    text.includes("\n");

  if (!isBlock) {
    return (
      <code className={className} {...props}>
        {children}
      </code>
    );
  }

  return <CodeBlock code={text} language={match?.[1] ?? null} />;
}
