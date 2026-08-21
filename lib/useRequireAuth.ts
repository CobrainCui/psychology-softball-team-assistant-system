"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/useSession";
import type { SessionUser } from "@/lib/auth/types";

/** 功能页统一鉴权：无 session 时跳转登录 */
export function useRequireAuth(): {
  currentUser: SessionUser | null;
  isMounted: boolean;
  isAuthenticated: boolean;
  loading: boolean;
} {
  const { user, isMounted, loading, isAuthenticated } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (isMounted && !loading && !user) {
      router.replace("/login");
    }
  }, [isMounted, loading, user, router]);

  return {
    currentUser: user,
    isMounted,
    isAuthenticated,
    loading,
  };
}

/** @deprecated 使用 useSession / SessionUser */
export type { SessionUser as CurrentUser } from "@/lib/auth/types";
