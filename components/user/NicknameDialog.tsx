"use client";

import { FormEvent, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

type Props = {
  open: boolean;
  initialNickname: string;
  onClose: () => void;
  onSave: (nickname: string) => Promise<void>;
};

export function NicknameDialog({
  open,
  initialNickname,
  onClose,
  onSave,
}: Props) {
  const [value, setValue] = useState(initialNickname);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setValue(initialNickname);
      setError(null);
    }
  }, [open, initialNickname]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const next = value.trim();
    if (!next) {
      setError("昵称不能为空");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(next);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.button
            type="button"
            aria-label="关闭"
            className="fixed inset-0 z-[60] bg-black/55"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal
            aria-labelledby="nickname-dialog-title"
            className="fixed left-1/2 top-1/2 z-[70] w-[min(92vw,22rem)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-panel-border bg-panel p-5 shadow-2xl"
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 4 }}
          >
            <h3
              id="nickname-dialog-title"
              className="text-base font-semibold text-foreground"
            >
              修改昵称
            </h3>
            <p className="mt-1 text-xs text-muted">
              聊天消息将显示新昵称（最长 24 字）
            </p>

            <form onSubmit={(e) => void handleSubmit(e)} className="mt-4 space-y-3">
              <input
                autoFocus
                value={value}
                maxLength={24}
                onChange={(e) => setValue(e.target.value)}
                className="w-full rounded-xl border border-panel-border bg-card px-3 py-2.5 text-sm text-foreground outline-none focus:border-accent/50"
                placeholder="输入新昵称"
              />
              {error && (
                <p className="text-xs text-red-300">{error}</p>
              )}
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-xl border border-panel-border px-3 py-2 text-xs text-muted hover:text-foreground"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-xl bg-accent px-3 py-2 text-xs font-semibold text-[#042f2e] disabled:opacity-50"
                >
                  {saving ? "保存中…" : "保存"}
                </button>
              </div>
            </form>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
