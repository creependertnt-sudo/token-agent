"use client";

import Link from "next/link";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { AuthUser } from "@/components/chat/types";
import { NicknameDialog } from "@/components/user/NicknameDialog";
import { avatarInitials, displayNickname } from "@/lib/user-profile";

type Props = {
  user: AuthUser;
  messageCount: number;
  conversationId: string | null;
  open: boolean;
  onClose: () => void;
  onLogout: () => void;
  onNicknameSaved: (user: AuthUser) => void;
  saveNickname: (nickname: string) => Promise<AuthUser>;
};

export function CustomerPanel({
  user,
  messageCount,
  conversationId,
  open,
  onClose,
  onLogout,
  onNicknameSaved,
  saveNickname,
}: Props) {
  const [editOpen, setEditOpen] = useState(false);
  const nickname = displayNickname(user.nickname);
  const avatar = user.avatar?.trim() || avatarInitials(user.nickname);

  const panelBody = (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="shrink-0 border-b border-panel-border px-5 py-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-[11px] tracking-[0.18em] text-accent uppercase">
              Customer Profile
            </p>
            <h2 className="mt-1 text-lg font-semibold text-foreground">客户信息</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-panel-border px-2.5 py-1 text-xs text-muted lg:hidden"
          >
            关闭
          </button>
        </div>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
        {/* 用户信息 */}
        <div className="flex items-center gap-3 rounded-2xl border border-panel-border bg-card p-4 shadow-sm">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-400 to-teal-500 text-sm font-bold text-[#042f2e]">
            {avatar.slice(0, 2)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-foreground">
              {nickname}
            </p>
            <p className="truncate text-xs text-muted">{user.email}</p>
            <button
              type="button"
              onClick={() => setEditOpen(true)}
              className="mt-1.5 text-[11px] font-medium text-accent hover:underline"
            >
              修改昵称
            </button>
          </div>
        </div>

        {/* Token 余额 */}
        <div className="rounded-2xl border border-panel-border bg-card p-4 shadow-sm">
          <p className="text-xs text-muted">AI服务额度</p>
          <p className="mt-1 text-3xl font-semibold text-accent">
            {user.tokenBalance.toLocaleString()}
            <span className="ml-1 text-sm font-medium text-muted">Token</span>
          </p>
          <p className="mt-2 text-xs leading-5 text-muted">
            高级功能扣费；普通客服咨询免费。
          </p>
          <div className="mt-4 grid gap-2">
            <Link
              href="/recharge"
              className="flex w-full items-center justify-center rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-[#042f2e] transition hover:brightness-110"
            >
              购买Token
            </Link>
            <Link
              href="/writer"
              className="flex w-full items-center justify-center rounded-xl border border-panel-border px-4 py-2.5 text-sm text-muted transition hover:text-foreground"
            >
              AI写作助手
            </Link>
          </div>
        </div>

        {/* 菜单 / 会话信息 */}
        <div className="space-y-2 rounded-2xl border border-panel-border bg-card p-3 shadow-sm">
          <InfoRow label="用户 ID" value={user.id.slice(0, 10) + "…"} />
          <InfoRow label="会话消息" value={`${messageCount} 条`} />
          <InfoRow
            label="会话 ID"
            value={conversationId ? conversationId.slice(0, 12) + "…" : "新会话"}
          />
          <InfoRow label="客服模式" value="DeepSeek Agent" />
          <InfoRow label="Memory" value="已启用" />
          <InfoRow label="免费咨询余量" value={`${user.freeChatCount}`} />
        </div>
      </div>

      <div className="shrink-0 border-t border-panel-border p-4">
        <div className="rounded-2xl border border-panel-border bg-card p-2 shadow-sm">
          <button
            type="button"
            onClick={onLogout}
            className="w-full rounded-xl border border-panel-border px-4 py-2.5 text-sm text-muted transition hover:border-red-400/40 hover:text-red-500"
          >
            退出登录
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <aside className="sticky top-0 hidden h-screen w-[300px] shrink-0 overflow-hidden border-r border-panel-border bg-sidebar lg:block">
        {panelBody}
      </aside>

      <AnimatePresence>
        {open && (
          <>
            <motion.button
              type="button"
              aria-label="关闭侧栏"
              className="fixed inset-0 z-40 bg-black/55 lg:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onClose}
            />
            <motion.aside
              className="fixed inset-y-0 left-0 z-50 h-screen w-[86%] max-w-sm overflow-hidden border-r border-panel-border bg-sidebar lg:hidden"
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", stiffness: 320, damping: 32 }}
            >
              {panelBody}
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <NicknameDialog
        open={editOpen}
        initialNickname={nickname}
        onClose={() => setEditOpen(false)}
        onSave={async (next) => {
          const updated = await saveNickname(next);
          onNicknameSaved(updated);
        }}
      />
    </>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-panel-border/70 bg-sidebar/55 px-3 py-2.5">
      <span className="text-xs text-muted">{label}</span>
      <span className="truncate text-xs font-medium text-foreground">{value}</span>
    </div>
  );
}
