"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DraftScope } from "@/lib/scopedStorage";
import {
  loadFailedSyncOutbox,
  removeSyncOutboxItem,
  type SyncOutboxItem,
} from "@/lib/syncOutbox";
import {
  countPendingSync,
  flushAccountSyncOutbox,
  type SyncFlushResult,
} from "@/lib/syncOutboxFlush";

const FLUSH_MS = 20000;

export function useSyncOutbox(
  scope: DraftScope | null,
  onFlushed?: (result: SyncFlushResult) => void
) {
  const [pendingCount, setPendingCount] = useState(0);
  const [failedItems, setFailedItems] = useState<SyncOutboxItem[]>([]);
  const onFlushedRef = useRef(onFlushed);
  useEffect(() => {
    onFlushedRef.current = onFlushed;
  }, [onFlushed]);

  const refreshCounts = useCallback(() => {
    setPendingCount(countPendingSync(scope));
    setFailedItems(loadFailedSyncOutbox(scope));
  }, [scope]);

  const flush = useCallback(async () => {
    if (!scope) return;
    if (typeof document !== "undefined" && document.hidden) return;
    const result = await flushAccountSyncOutbox(scope);
    refreshCounts();
    onFlushedRef.current?.(result);
  }, [refreshCounts, scope]);

  const dismissFailed = useCallback(
    (dedupeKey: string) => {
      removeSyncOutboxItem(scope, dedupeKey);
      refreshCounts();
    },
    [refreshCounts, scope]
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      refreshCounts();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [refreshCounts]);

  useEffect(() => {
    const kickoff = window.setTimeout(() => {
      void flush();
    }, 0);
    const poll = window.setInterval(() => {
      void flush();
    }, FLUSH_MS);
    const onOnline = () => {
      void flush();
    };
    const onVisible = () => {
      if (!document.hidden) void flush();
    };
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearTimeout(kickoff);
      window.clearInterval(poll);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [flush]);

  return { pendingCount, failedItems, dismissFailed, flush, refreshCounts };
}
