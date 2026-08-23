"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import MatchWindowBanner from "@/components/season/MatchWindowBanner";
import ConflictReviewDrawer from "@/components/test-day/ConflictReviewDrawer";
import TestDayBoard from "@/components/test-day/TestDayBoard";
import { useCloudTestDaySession } from "@/hooks/useCloudTestDaySession";
import { useSession } from "@/lib/useSession";
import { canArchiveTestSessionFromUser } from "@/lib/auth/policy";
import {
  freezeTestDayDraft,
  joinTestDayDraft,
} from "@/lib/testDay/draftActions";
import {
  archiveTestDayDraft,
  resolveTestDayConflict,
} from "@/lib/testDay/collabActions";
import {
  buildClientArchivePayload,
  sessionArchiveHasContent,
} from "@/lib/testDay/archiveValidation";

export default function CloudTestDayClient({ draftId }: { draftId: string }) {
  const session = useCloudTestDaySession(draftId);
  const router = useRouter();
  const { user } = useSession();
  const canArchive = canArchiveTestSessionFromUser(user);
  const [busy, setBusy] = useState(false);
  const dto = session.dto;

  const handleJoin = async () => {
    setBusy(true);
    const res = await joinTestDayDraft(draftId);
    setBusy(false);
    if (!res.success) {
      console.error("云端被拒:", res.error);
      window.alert(res.error);
      return;
    }
    await session.refresh();
  };

  const handleFreeze = async () => {
    if (!confirm("冻结后不能再加入或改排阵，仍可录入成绩。确认冻结？")) return;
    setBusy(true);
    const res = await freezeTestDayDraft(draftId);
    setBusy(false);
    if (!res.success) {
      console.error("云端被拒:", res.error);
      window.alert(res.error);
      return;
    }
    await session.refresh();
  };

  const handleArchive = async () => {
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
      customTestDefs: session.customTestDefs,
      customPlayerNotes: session.customPlayerNotes,
      customGroupNotes: session.customGroupNotes,
      customSingleNotes: session.customSingleNotes,
    });
    if (!sessionArchiveHasContent(payload)) {
      window.alert("当前没有可归档的测试记录。");
      return;
    }
    if (!confirm("确认归档为正式成绩？归档后不可再改。")) return;
    setBusy(true);
    const res = await archiveTestDayDraft(draftId);
    setBusy(false);
    if (!res.success) {
      console.error("云端被拒:", res.error);
      window.alert(res.error);
      return;
    }
    window.alert("云端归档成功。");
    router.push("/");
  };

  if (!dto) {
    return (
      <div className="flex flex-1 items-center justify-center bg-zinc-50 p-4 text-sm text-zinc-500">
        {session.loadError ?? "Loading..."}
      </div>
    );
  }

  const statusLabel =
    dto.status === "open"
      ? "进行中"
      : dto.status === "frozen"
        ? "已冻结"
        : "已归档";

  return (
    <div className="flex flex-1 justify-center bg-zinc-50 p-4">
      <div className="flex w-full max-w-5xl flex-col items-start gap-6 md:flex-row">
        <TestDayBoard
          session={session}
          canManageRoster={canArchive}
          scoresDisabled={!dto.isMember || dto.status === "archived"}
          header={
            <>
              <MatchWindowBanner />
              <h1 className="text-center text-sm font-medium tracking-wide text-zinc-500">
                云端协作草稿
              </h1>
              <p className="text-center text-xs text-zinc-500">
                {dto.date} · {statusLabel} · 冲突 {dto.openConflictCount}
              </p>
              {!dto.isMember ? (
                <div className="flex flex-col items-center gap-2">
                  <p className="text-sm text-zinc-600">加入后才能提交成绩。</p>
                  {dto.status === "open" ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleJoin()}
                      className="bg-black px-4 py-2 text-sm text-white hover:bg-zinc-800 disabled:bg-zinc-400"
                    >
                      加入该场次
                    </button>
                  ) : (
                    <p className="text-xs text-zinc-500">
                      该场次已冻结或归档，无法加入。
                    </p>
                  )}
                </div>
              ) : null}
              {dto.canMutateStructure && dto.status === "open" ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void handleFreeze()}
                  className="border border-zinc-400 py-2 text-sm text-zinc-800 hover:bg-zinc-100"
                >
                  冻结场次（停加入与改排阵）
                </button>
              ) : null}
              <ConflictReviewDrawer
                conflicts={dto.conflicts}
                canResolve={canArchive && dto.status !== "archived"}
                busy={busy}
                onResolve={async (input) => {
                  setBusy(true);
                  const res = await resolveTestDayConflict({
                    draftId,
                    ...input,
                  });
                  setBusy(false);
                  if (!res.success) {
                    console.error("云端被拒:", res.error);
                    window.alert(res.error);
                    return;
                  }
                  await session.refresh();
                }}
              />
            </>
          }
          footer={
            canArchive && dto.status !== "archived" ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleArchive()}
                className="w-full bg-black py-4 text-base font-bold text-white hover:bg-zinc-800 disabled:bg-zinc-400"
              >
                复核归档为正式成绩
              </button>
            ) : dto.status === "archived" ? (
              <p className="w-full border border-zinc-300 py-3 text-center text-sm text-zinc-500">
                已归档，正式成绩只读。
              </p>
            ) : (
              <p className="w-full border border-zinc-300 py-3 text-center text-sm text-zinc-500">
                正式归档由队长或教练在无未决冲突后执行。
              </p>
            )
          }
        />
      </div>
    </div>
  );
}
