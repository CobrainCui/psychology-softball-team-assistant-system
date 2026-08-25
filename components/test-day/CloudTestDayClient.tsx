"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import MatchWindowBanner from "@/components/season/MatchWindowBanner";
import ConflictReviewDrawer from "@/components/test-day/ConflictReviewDrawer";
import FieldNotice from "@/components/test-day/FieldNotice";
import RetryNotice from "@/components/test-day/RetryNotice";
import TestDayBoard from "@/components/test-day/TestDayBoard";
import { useCloudTestDaySession } from "@/hooks/useCloudTestDaySession";
import { useSession } from "@/lib/useSession";
import { canArchiveTestSessionFromUser } from "@/lib/auth/policy";
import {
  freezeTestDayDraft,
  joinTestDayDraft,
} from "@/lib/testDay/draftActions";
import ArchiveReadyPanel from "@/components/test-day/ArchiveReadyPanel";
import {
  ARCHIVE_DEVICES_NOT_READY_ERROR,
  ARCHIVE_SELF_FAILED_ERROR,
} from "@/lib/testDay/collab/archiveReady";
import {
  abandonTestDayFailedOutbox,
  reportTestDayDeviceOutbox,
} from "@/lib/testDay/deviceActions";
import { getClientDeviceId } from "@/lib/testDay/clientDevice";
import { draftScopeFromUser } from "@/lib/scopedStorage";
import {
  ARCHIVE_PENDING_SYNC_ERROR,
  countFailedTestDayOutbox,
  countPendingTestDayOutbox,
  FAILED_SYNC_COPY,
  outboxItemDraftId,
  PENDING_SYNC_COPY,
  retrySyncOutboxItem,
} from "@/lib/syncOutbox";
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
  const scope = draftScopeFromUser(user);
  const canArchive = canArchiveTestSessionFromUser(user);
  const [busy, setBusy] = useState(false);
  const dto = session.dto;

  const handleJoin = async () => {
    setBusy(true);
    const res = await joinTestDayDraft(draftId, getClientDeviceId(scope) ?? undefined);
    setBusy(false);
    if (!res.success) {
      console.error("云端被拒:", res.error);
      session.setFieldNotice(res.error);
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
      session.setFieldNotice(res.error);
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
      session.setFieldNotice("当前没有可归档的测试记录。");
      return;
    }
    const deviceId = getClientDeviceId(scope);
    if (!deviceId) {
      session.setFieldNotice("缺少本机设备标识");
      return;
    }
    const pendingCount = countPendingTestDayOutbox(scope, draftId);
    const failedCount = countFailedTestDayOutbox(scope, draftId);
    if (pendingCount > 0) {
      session.setFieldNotice(ARCHIVE_PENDING_SYNC_ERROR);
      return;
    }
    if (failedCount > 0) {
      session.setFieldNotice(ARCHIVE_SELF_FAILED_ERROR);
      return;
    }
    const report = await reportTestDayDeviceOutbox(draftId, deviceId, {
      pendingCount,
      failedCount,
    });
    if (!report.success) {
      console.error("云端被拒:", report.error);
      session.setFieldNotice(report.error);
      return;
    }
    await session.refresh();
    if (pendingCount > 0 || failedCount > 0) {
      session.setFieldNotice(
        pendingCount > 0
          ? ARCHIVE_PENDING_SYNC_ERROR
          : ARCHIVE_SELF_FAILED_ERROR
      );
      return;
    }
    if (!report.allDevicesArchiveReady) {
      session.setFieldNotice(ARCHIVE_DEVICES_NOT_READY_ERROR);
      return;
    }
    if (!confirm("确认归档为正式成绩？归档后不可再改。")) return;
    setBusy(true);
    const res = await archiveTestDayDraft(draftId);
    setBusy(false);
    if (!res.success) {
      console.error("云端被拒:", res.error);
      session.setFieldNotice(res.error);
      return;
    }
    router.push("/");
  };

  if (!dto) {
    return (
      <div className="flex flex-1 items-center justify-center bg-zinc-50 p-4">
        {session.loadError ? (
          <RetryNotice
            message={session.loadError}
            onRetry={() => void session.refresh()}
            busy={busy}
          />
        ) : (
          <p className="text-sm text-zinc-500">Loading...</p>
        )}
      </div>
    );
  }

  const statusLabel =
    dto.status === "open"
      ? "进行中"
      : dto.status === "frozen"
        ? "已冻结"
        : "已归档";

  if (!dto.isMember) {
    return (
      <div className="flex flex-1 justify-center bg-zinc-50 p-4">
        <div className="flex w-full max-w-md flex-col gap-3 border border-zinc-300 bg-white p-4">
          <MatchWindowBanner />
          <h1 className="text-center text-sm font-medium tracking-wide text-zinc-500">
            云端协作草稿
          </h1>
          <p className="text-center text-xs text-zinc-500">
            {dto.date} · {statusLabel}
          </p>
          <p className="text-center text-sm text-zinc-600">
            加入后才能查看成绩并录入。
          </p>
          {session.fieldNotice ? (
            <FieldNotice
              message={session.fieldNotice}
              onDismiss={() => session.setFieldNotice(null)}
            />
          ) : null}
          {dto.status === "open" ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleJoin()}
              className="bg-black px-4 py-2 text-sm text-white hover:bg-zinc-800 disabled:bg-zinc-400"
            >
              加入该场次
            </button>
          ) : dto.archivedSessionId ? (
            <Link
              href={`/sessions/${dto.archivedSessionId}`}
              className="border border-zinc-400 px-4 py-2 text-center text-sm text-zinc-800 hover:bg-zinc-100"
            >
              查看正式归档
            </Link>
          ) : (
            <p className="text-center text-xs text-zinc-500">
              该场次已冻结或归档，无法加入。请从大厅查看正式归档。
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 justify-center bg-zinc-50 p-4">
      <div className="flex w-full max-w-5xl flex-col items-start gap-6 md:flex-row">
        <TestDayBoard
          session={session}
          canManageRoster={canArchive}
          scoresDisabled={
            !dto.isMember ||
            dto.status === "archived" ||
            Boolean(session.rosterError) ||
            !session.rosterReady ||
            dto.selfDeviceReady
          }
          header={
            <>
              <MatchWindowBanner />
              <h1 className="text-center text-sm font-medium tracking-wide text-zinc-500">
                云端协作草稿
              </h1>
              <p className="text-center text-xs text-zinc-500">
                {dto.date} · {statusLabel} · 冲突 {dto.openConflictCount}
                {session.syncedAt
                  ? ` · 上次同步 ${session.syncedAt.toLocaleTimeString("zh-CN", { hour12: false })}`
                  : ""}
              </p>
              {session.fieldNotice ? (
                <FieldNotice
                  message={session.fieldNotice}
                  onDismiss={() => session.setFieldNotice(null)}
                />
              ) : null}
              {session.draftPendingCount > 0 &&
              session.fieldNotice !== PENDING_SYNC_COPY &&
              session.fieldNotice !== ARCHIVE_PENDING_SYNC_ERROR ? (
                <FieldNotice message={PENDING_SYNC_COPY} />
              ) : null}
              {session.pendingEntryIds.length > 0 ? (
                <p className="text-center text-xs text-amber-800">
                  盘面含 {session.pendingEntryIds.length}{" "}
                  条本机待同步记录，其他设备还看不到。
                </p>
              ) : null}
              {session.syncError ? (
                <RetryNotice
                  message={session.syncError}
                  onRetry={() => void session.refresh()}
                  busy={busy}
                />
              ) : null}
              {session.failedItems.filter(
                (row) => outboxItemDraftId(row) === draftId
              ).length > 0 ? (
                <section className="border border-zinc-400 bg-white p-3">
                  <p className="text-sm text-zinc-800">{FAILED_SYNC_COPY}</p>
                  <ul className="mt-2 flex flex-col gap-2">
                    {session.failedItems
                      .filter((row) => outboxItemDraftId(row) === draftId)
                      .map((row) => (
                        <li
                          key={row.dedupeKey}
                          className="flex items-start justify-between gap-2 text-xs text-zinc-700"
                        >
                          <p className="flex-1">
                            {row.kind === "test_day_tombstone"
                              ? "删除未上云"
                              : "录入未上云"}
                            {row.failedReason ? ` · ${row.failedReason}` : ""}
                          </p>
                          <div className="flex shrink-0 gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                if (dto.selfDeviceReady) {
                                  session.setFieldNotice(
                                    "请先取消确认，再重试上云。"
                                  );
                                  return;
                                }
                                retrySyncOutboxItem(scope, row.dedupeKey);
                                void session.refresh();
                              }}
                              className="border border-zinc-400 px-2 py-1 hover:bg-zinc-100"
                            >
                              重试
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (dto.selfDeviceReady) {
                                  session.setFieldNotice(
                                    "请先取消确认，再放弃失败记录。"
                                  );
                                  return;
                                }
                                if (
                                  !confirm(
                                    "确认放弃这条未能上云的记录？将写入归档审计，本机不再提示。已确认同步时不能放弃。"
                                  )
                                ) {
                                  return;
                                }
                                const deviceId = getClientDeviceId(scope);
                                if (!deviceId) {
                                  session.setFieldNotice("缺少本机设备标识");
                                  return;
                                }
                                void abandonTestDayFailedOutbox({
                                  draftId,
                                  deviceId,
                                  dedupeKey: row.dedupeKey,
                                  kind: row.kind,
                                  failedReason: row.failedReason,
                                }).then((res) => {
                                  if (!res.success) {
                                    console.error("云端被拒:", res.error);
                                    session.setFieldNotice(res.error);
                                    return;
                                  }
                                  session.dismissFailed(row.dedupeKey);
                                });
                              }}
                              className="border border-zinc-400 px-2 py-1 hover:bg-zinc-100"
                            >
                              放弃并记录
                            </button>
                          </div>
                        </li>
                      ))}
                  </ul>
                </section>
              ) : null}
              {session.rosterError ? (
                <RetryNotice
                  message={session.rosterError}
                  onRetry={() => void session.reloadRoster()}
                />
              ) : null}
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
                    session.setFieldNotice(res.error);
                    return;
                  }
                  await session.refresh();
                }}
              />
              {dto.status !== "archived" ? (
                <ArchiveReadyPanel
                  deviceGates={dto.deviceGates}
                  draftPendingCount={session.draftPendingCount}
                  draftFailedCount={session.draftFailedCount}
                  openConflictCount={dto.openConflictCount}
                  busy={busy}
                  onConfirm={() => void session.confirmArchiveReady()}
                  onClear={() => void session.clearArchiveReady()}
                />
              ) : null}
            </>
          }
          footer={
            canArchive && dto.status !== "archived" ? (
              <button
                type="button"
                disabled={
                  busy ||
                  session.draftPendingCount > 0 ||
                  session.draftFailedCount > 0 ||
                  !dto.allDevicesArchiveReady
                }
                onClick={() => void handleArchive()}
                className="w-full bg-black py-4 text-base font-bold text-white hover:bg-zinc-800 disabled:bg-zinc-400"
              >
                {session.draftPendingCount > 0
                  ? "待同步完成后再归档"
                  : session.draftFailedCount > 0
                    ? "失败记录处理后再归档"
                    : dto.allDevicesArchiveReady
                    ? "复核归档为正式成绩"
                    : "等待全部设备确认已同步"}
              </button>
            ) : dto.status === "archived" ? (
              dto.archivedSessionId ? (
                <Link
                  href={`/sessions/${dto.archivedSessionId}`}
                  className="block w-full border border-zinc-300 py-3 text-center text-sm text-zinc-800 hover:bg-zinc-100"
                >
                  已归档，查看正式成绩
                </Link>
              ) : (
                <p className="w-full border border-zinc-300 py-3 text-center text-sm text-zinc-500">
                  已归档，正式成绩只读。
                </p>
              )
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
