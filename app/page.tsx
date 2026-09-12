"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** 主聊天入口迁移至 /chat（转化向体验） */
export default function HomeRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/chat");
  }, [router]);

  return (
    <div className="flex h-screen items-center justify-center bg-background text-sm text-muted">
      正在进入对话…
    </div>
  );
}
