"use client";

import { useEffect, useState } from "react";
import MatchWindowBanner from "@/components/season/MatchWindowBanner";
import CloudTestDayClient from "@/components/test-day/CloudTestDayClient";
import TestDayBoard from "@/components/test-day/TestDayBoard";
import { useTestDaySession } from "@/hooks/useTestDaySession";
import { getPlayers, saveTestSession } from "@/lib/actions";
import {
  buildClientArchivePayload,
  sessionArchiveHasContent,
} from "@/lib/testDay/archiveValidation";
import { useSession } from "@/lib/useSession";
import { canArchiveTestSessionFromUser } from "@/lib/auth/policy";

function LocalTestDayLayout() {
  const session = useTestDaySession();
  const { user } = useSession();
  const canArchive = canArchiveTestSessionFromUser(user);
  const [rosterReady, setRosterReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (!session.accountId) {
        setRosterReady(false);
        return;
      }
      setRosterReady(false);
      void (async () => {
        const res = await getPlayers();
        if (cancelled) return;
        if (!res.success) {
          console.error("云端被拒:", res.error);
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
  }, [session.accountId]);

  const handleArchiveGame = async () => {
    const payload = buildClientArchivePayload({
      hits: session.hits,
      speedColumns: session.speedColumns,
      speedMarks: session.speedMarks,
      flyCatchAttempts: session.flyCatchAttempts,
      strikeJudgeColumns: session.strikeJudgeColumns,
      strikeJudgeCells: session.strikeJudgeCells,
      throwPlays: session.throwPlays,
      assignments: session.assignments,
      testItems: session.testItems,
      assignmentLog: session.assignmentLog,
      customTestDefs: session.customSlice.customTestDefs,
      customPlayerNotes: session.customSlice.customPlayerNotes,
      customGroupNotes: session.customSlice.customGroupNotes,
      customSingleNotes: session.customSlice.customSingleNotes,
    });

    if (!sessionArchiveHasContent(payload)) {
      window.alert("当前没有可归档的测试记录。");
      return;
    }
    if (!confirm("确认结束本次综合测试？当前记录将归档存查并清空盘面。")) {
      return;
    }

    const res = await saveTestSession(payload);
    if (res.success) {
      window.alert("云端存档成功！");
      session.clearBoardAfterArchive();
    } else {
      console.error("云端被拒:", res.error);
      window.alert("云端写入失败！原因请看F12。已自动保存为本地草稿。");
      session.persistDraft();
    }
  };

  if (!rosterReady) {
    return (
      <div className="flex flex-1 items-center justify-center bg-zinc-50 p-4 text-sm text-zinc-500">
        Loading...
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
                本机草稿，待队长/教练归档。正式成绩以云端为准。
              </p>
              {session.peerWriting ? (
                <p className="text-center text-xs text-zinc-600">
                  另一标签正在写入本机草稿，请避免同时录入。
                </p>
              ) : null}
            </>
          }
          footer={
            canArchive ? (
              <button
                onClick={() => void handleArchiveGame()}
                className="w-full bg-black py-4 text-base font-bold text-white transition-colors hover:bg-zinc-800"
              >
                结束本次综合测试并存档
              </button>
            ) : (
              <p className="w-full border border-zinc-300 py-3 text-center text-sm text-zinc-500">
                本机草稿已自动保存。正式归档由队长或教练执行。
              </p>
            )
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
