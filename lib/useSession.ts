"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { getMe } from "@/lib/auth/meActions";
import type { SessionUser } from "@/lib/auth/types";

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
    if (res.success) setUser(res.user);
    else setUser(null);
    setLoading(false);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refresh();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  return {
    user,
    isMounted,
    loading,
    isAuthenticated: Boolean(user),
    refresh,
  };
}
