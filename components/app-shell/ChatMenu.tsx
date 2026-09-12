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
import styles from "./app-shell.module.css";

export type ChatMenuAction = "pin" | "rename" | "delete";

type Props = {
  pinned?: boolean;
  onOpenChange?: (open: boolean) => void;
  onAction?: (action: ChatMenuAction) => void;
};

const ITEM_PRESS_MS = 80;
const MENU_GAP = 6;

export function ChatMenu({ pinned, onOpenChange, onAction }: Props) {
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<CSSProperties | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const pressingRef = useRef(false);
  const pressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const menuId = useId();

  const menuItems: { id: ChatMenuAction; label: string }[] = [
    { id: "pin", label: pinned ? "📌 取消置顶" : "📌 置顶对话" },
    { id: "rename", label: "✏️ 重命名" },
    { id: "delete", label: "🗑 删除" },
  ];

  function setMenuOpen(next: boolean) {
    setOpen(next);
    onOpenChange?.(next);
    if (!next) setMenuPos(null);
  }

  function placeMenu() {
    const button = buttonRef.current;
    const menu = menuRef.current;
    if (!button || !menu) return;
    const rect = button.getBoundingClientRect();
    const menuWidth = menu.offsetWidth || 132;
    setMenuPos({
      position: "fixed",
      top: rect.bottom + MENU_GAP,
      left: Math.max(8, rect.right - menuWidth),
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
  }, [open]);

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
      setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function handleItemClick(
    e: MouseEvent<HTMLButtonElement>,
    action: ChatMenuAction,
  ) {
    e.stopPropagation();
    if (pressingRef.current) return;
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
      className={styles.chatMenuRoot}
      ref={rootRef}
      data-open={open || undefined}
    >
      <button
        ref={buttonRef}
        type="button"
        className={styles.chatItemMenuBtn}
        aria-label="对话操作"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (open) {
            setMenuOpen(false);
            return;
          }
          const rect = buttonRef.current?.getBoundingClientRect();
          if (rect) {
            setMenuPos({
              position: "fixed",
              top: rect.bottom + MENU_GAP,
              left: Math.max(8, rect.right - 132),
              right: "auto",
              bottom: "auto",
            });
          }
          setMenuOpen(true);
        }}
      >
        ⋯
      </button>
      {open ? (
        <div
          id={menuId}
          ref={menuRef}
          className={styles.chatMenu}
          role="menu"
          style={menuPos ?? undefined}
          onClick={(e) => e.stopPropagation()}
        >
          {menuItems.map((item) => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              className={
                item.id === "delete"
                  ? `${styles.chatMenuItem} ${styles.menuItemDanger}`
                  : styles.chatMenuItem
              }
              data-action={item.id}
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
