"use client";

import { useEffect, useState } from "react";
import MatchWindowBanner from "@/components/season/MatchWindowBanner";
import CloudTestDayClient from "@/components/test-day/CloudTestDayClient";
import FieldNotice from "@/components/test-day/FieldNotice";
import RetryNotice from "@/components/test-day/RetryNotice";
import TestDayBoard from "@/components/test-day/TestDayBoard";
import { useTestDaySession } from "@/hooks/useTestDaySession";
import { getPlayers } from "@/lib/actions";
import { useSession } from "@/lib/useSession";
import { canArchiveTestSessionFromUser } from "@/lib/auth/policy";

function LocalTestDayLayout() {
  const session = useTestDaySession();
  const { user } = useSession();
  const canArchive = canArchiveTestSessionFromUser(user);
  const [rosterReady, setRosterReady] = useState(false);
  const [rosterError, setRosterError] = useState<string | null>(null);
  const [rosterNonce, setRosterNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (!session.accountId) {
        setRosterReady(false);
        setRosterError(null);
        return;
      }
      setRosterReady(false);
      setRosterError(null);
      void (async () => {
        const res = await getPlayers();
        if (cancelled) return;
        if (!res.success) {
          console.error("云端被拒:", res.error);
          setRosterError(res.error);
          setRosterReady(true);
          return;
        }
        session.setPlayers(
          res.players.map((player) => ({
            id: player.id,
            name: player.name,
            gender: player.gender ?? undefined,
            role: player.role,
          }))
        );
        setRosterReady(true);
      })();
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.accountId, rosterNonce]);

  if (!rosterReady && !rosterError) {
    return (
      <div className="flex flex-1 items-center justify-center bg-zinc-50 p-4 text-sm text-zinc-500">
        Loading...
      </div>
    );
  }

  if (rosterError) {
    return (
      <div className="flex flex-1 items-center justify-center bg-zinc-50 p-4">
        <RetryNotice
          message={rosterError}
          onRetry={() => setRosterNonce((n) => n + 1)}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-1 justify-center bg-zinc-50 p-4">
      <div className="flex w-full max-w-5xl flex-col items-start gap-6 md:flex-row">
        <TestDayBoard
          session={session}
          canManageRoster={canArchive}
          header={
            <>
              <MatchWindowBanner />
              <h1 className="text-center text-sm font-medium tracking-wide text-zinc-500">
                测试清单
              </h1>
              <p className="text-center text-xs text-zinc-500">
                本机草稿仅供单设备恢复。正式成绩须从云端协作场次归档。
              </p>
              {session.fieldNotice ? (
                <FieldNotice
                  message={session.fieldNotice}
                  onDismiss={() => session.setFieldNotice(null)}
                />
              ) : null}
              {session.peerWriting ? (
                <p className="text-center text-xs text-zinc-600">
                  另一标签正在写入本机草稿，请避免同时录入。
                </p>
              ) : null}
            </>
          }
          footer={
            <p className="w-full border border-zinc-300 py-3 text-center text-sm text-zinc-500">
              本机草稿已自动保存。请到大厅进入云端协作场次后再归档。
            </p>
          }
        />
      </div>
    </div>
  );
}

export default function TestDayClient({ draftId }: { draftId?: string }) {
  if (draftId) return <CloudTestDayClient draftId={draftId} />;
  return <LocalTestDayLayout />;
}
