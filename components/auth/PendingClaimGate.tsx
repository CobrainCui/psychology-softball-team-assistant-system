"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "@/lib/useSession";
import { isAuthPublicPath } from "@/lib/auth/publicPaths";

/** pending 认领拦截业务页；纯 admin 只留 /admin */
export default function PendingClaimGate({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, isMounted, loading } = useSession();
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const rostered = Boolean(
    user && user.claimStatus === "approved" && user.playerId
  );
  const adminOpsOnly = Boolean(
    user && user.roles.includes("admin") && !rostered
  );

  useEffect(() => {
    if (!adminOpsOnly) return;
    if (pathname === "/admin") return;
    router.replace("/admin");
  }, [adminOpsOnly, pathname, router]);

  if (!isMounted || loading) return null;
  if (!user) return <>{children}</>;
  if (isAuthPublicPath(pathname)) return <>{children}</>;
  if (adminOpsOnly) {
    if (pathname === "/admin") return <>{children}</>;
    return null;
  }
  if (rostered) return <>{children}</>;

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
