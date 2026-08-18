"use client";

import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import { isAdminRole } from "@/lib/admin-role";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading } = useAuth({ requireAuth: true });

  if (loading || !user) {
    return (
      <div className="flex h-screen items-center justify-center bg-background text-sm text-muted">
        加载中...
      </div>
    );
  }

  if (!isAdminRole(user.role)) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-background px-4 text-center">
        <p className="text-lg font-semibold text-foreground">没有管理员权限</p>
        <p className="text-sm text-muted">当前账号无法访问 /admin。</p>
        <Link
          href="/"
          className="rounded-xl border border-panel-border px-4 py-2 text-sm text-muted hover:text-foreground"
        >
          返回客服
        </Link>
      </div>
    );
  }

  return children;
}
