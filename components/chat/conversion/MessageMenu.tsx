"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
} from "react";
import styles from "./chat.module.css";

/** 消息级操作（对话级重命名/删除在 Sidebar） */
export type MessageMenuAction = "pin" | "copy" | "regenerate";

type Props = {
  pinned?: boolean;
  /** assistant：含重新生成；user：仅置顶/复制 */
  variant?: "assistant" | "user";
  /** start/end：菜单相对按钮对齐；工具栏统一在消息右上 */
  align?: "start" | "end";
  disabled?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** 菜单自身 hover（含 fixed 面板），与 messageWrapper 共享 hover 区 */
  onHoverChange?: (hovering: boolean) => void;
  onAction?: (action: MessageMenuAction) => void;
};

const ITEM_PRESS_MS = 80;
const MENU_GAP = 6;

export function MessageMenu({
  pinned,
  variant = "assistant",
  align = "end",
  disabled,
  onOpenChange,
  onHoverChange,
  onAction,
}: Props) {
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<CSSProperties | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const pressingRef = useRef(false);
  const pressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const menuId = useId();

  const menuItems: { id: MessageMenuAction; label: string }[] =
    variant === "assistant"
      ? [
          {
            id: "pin",
            label: pinned ? "📌 取消置顶" : "📌 置顶这条消息",
          },
          { id: "copy", label: "📋 复制内容" },
          { id: "regenerate", label: "🔁 重新生成" },
        ]
      : [
          {
            id: "pin",
            label: pinned ? "📌 取消置顶" : "📌 置顶这条消息",
          },
          { id: "copy", label: "📋 复制内容" },
        ];

  function setMenuOpen(next: boolean) {
    setOpen(next);
    onOpenChange?.(next);
    if (!next) {
      setMenuPos(null);
      onHoverChange?.(false);
    }
  }

  function placeMenu() {
    const button = buttonRef.current;
    const menu = menuRef.current;
    if (!button || !menu) return;

    const rect = button.getBoundingClientRect();
    const menuWidth = menu.offsetWidth || 148;
    const top = rect.bottom + MENU_GAP;
    const left =
      align === "start" ? rect.left : rect.right - menuWidth;

    setMenuPos({
      position: "fixed",
      top,
      left,
      right: "auto",
      bottom: "auto",
    });
  }

  useEffect(() => {
    return () => {
      if (pressTimerRef.current != null) clearTimeout(pressTimerRef.current);
    };
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    placeMenu();
    const onReposition = () => placeMenu();
    window.addEventListener("scroll", onReposition, true);
    window.addEventListener("resize", onReposition);
    return () => {
      window.removeEventListener("scroll", onReposition, true);
      window.removeEventListener("resize", onReposition);
    };
  }, [open, align]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: globalThis.MouseEvent) => {
      const target = e.target as Node;
      if (
        rootRef.current?.contains(target) ||
        menuRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
      onOpenChange?.(false);
      setMenuPos(null);
      onHoverChange?.(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        onOpenChange?.(false);
        setMenuPos(null);
        onHoverChange?.(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onOpenChange, onHoverChange]);

  function handleItemClick(
    e: MouseEvent<HTMLButtonElement>,
    action: MessageMenuAction,
  ) {
    e.stopPropagation();
    if (pressingRef.current || disabled) return;
    pressingRef.current = true;
    const btn = e.currentTarget;
    btn.dataset.press = "true";

    if (pressTimerRef.current != null) clearTimeout(pressTimerRef.current);
    pressTimerRef.current = setTimeout(() => {
      pressTimerRef.current = null;
      btn.dataset.press = "false";
      pressingRef.current = false;
      setMenuOpen(false);
      onAction?.(action);
    }, ITEM_PRESS_MS);
  }

  return (
    <div
      className={styles.menuRoot}
      ref={rootRef}
      onMouseEnter={() => onHoverChange?.(true)}
      onMouseLeave={() => {
        if (!open) onHoverChange?.(false);
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        className={styles.toolbarBtn}
        aria-label="更多"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation();
          if (disabled) return;
          if (open) {
            setMenuOpen(false);
            return;
          }
          const rect = buttonRef.current?.getBoundingClientRect();
          if (rect) {
            setMenuPos({
              position: "fixed",
              top: rect.bottom + MENU_GAP,
              left:
                align === "start" ? rect.left : rect.right - 148,
              right: "auto",
              bottom: "auto",
            });
          }
          onHoverChange?.(true);
          setMenuOpen(true);
        }}
      >
        ⋯
      </button>
      {open ? (
        <div
          id={menuId}
          ref={menuRef}
          className={styles.menu}
          data-align={align}
          role="menu"
          style={menuPos ?? undefined}
          onMouseEnter={() => onHoverChange?.(true)}
          onMouseLeave={() => onHoverChange?.(false)}
        >
          {menuItems.map((item) => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              className={styles.menuItem}
              data-action={item.id}
              disabled={disabled && item.id === "regenerate"}
              onClick={(e) => handleItemClick(e, item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
