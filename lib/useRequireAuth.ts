"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useCurrentUser, type CurrentUser } from "@/lib/currentUser";

// 功能页统一鉴权：挂载后若无身份则 replace 到 /login。
export function useRequireAuth(): {
  currentUser: CurrentUser | null;
  isMounted: boolean;
  isAuthenticated: boolean;
} {
  const { currentUser, isMounted } = useCurrentUser();
  const router = useRouter();

  useEffect(() => {
    if (isMounted && !currentUser) {
      router.replace("/login");
    }
  }, [isMounted, currentUser?.playerId, router]);

  return {
    currentUser,
    isMounted,
    isAuthenticated: Boolean(isMounted && currentUser),
  };
}
