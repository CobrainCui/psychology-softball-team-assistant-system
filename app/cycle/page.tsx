"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// /cycle 已并入综合状态评估，保留路由以免旧书签失效
export default function CycleRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/assessment");
  }, [router]);

  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 p-6">
      <p className="text-sm text-zinc-400">正在跳转到综合状态评估…</p>
    </div>
  );
}
