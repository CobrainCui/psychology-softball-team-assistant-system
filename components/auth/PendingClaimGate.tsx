"use client";

import { usePathname } from "next/navigation";
import { useSession } from "@/lib/useSession";
import { isAuthPublicPath } from "@/lib/auth/publicPaths";

/** pending 认领：阻止业务操作；admin 与公开路由不受 lock */
export default function PendingClaimGate({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, isMounted, loading } = useSession();
  const pathname = usePathname() ?? "/";

  if (!isMounted || loading) return null;
  if (!user) return <>{children}</>;
  if (isAuthPublicPath(pathname)) return <>{children}</>;
  if (user.roles.includes("admin")) return <>{children}</>;
  if (user.claimStatus === "approved" && user.playerId) {
    return <>{children}</>;
  }

  return (
    <main className="mx-auto max-w-lg px-6 py-16 text-center">
      <h1 className="mb-4 text-xl font-bold">等待管理员认领</h1>
      <p className="text-sm text-zinc-600">
        账号 <strong>{user.username}</strong> 已注册，名册绑定须由管理员在后台确认。
        确认前无法录入评估、伤病或测试日数据。
      </p>
    </main>
  );
}
