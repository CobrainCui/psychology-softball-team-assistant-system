"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { getMe } from "@/lib/auth/meActions";
import type { SessionUser } from "@/lib/auth/types";
import {
  subscribeAuthOwnerChange,
  syncAuthOwnerWithUser,
} from "@/lib/scopedStorage";

const subscribeAlways = () => () => {};

export function useSession() {
  const isMounted = useSyncExternalStore(
    subscribeAlways,
    () => true,
    () => false
  );
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const res = await getMe();
    if (res.success) {
      setUser(res.user);
      // cookie 为准：与 softball_auth_owner 不一致则回写
      syncAuthOwnerWithUser(res.user);
    } else {
      setUser(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refresh();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  useEffect(() => {
    return subscribeAuthOwnerChange(() => {
      void refresh();
    });
  }, [refresh]);

  return {
    user,
    isMounted,
    loading,
    isAuthenticated: Boolean(user),
    refresh,
  };
}
