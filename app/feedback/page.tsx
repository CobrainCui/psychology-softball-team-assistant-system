"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import MedicalDisclaimer from "@/components/MedicalDisclaimer";
import PageLoading from "@/components/PageLoading";
import { RecordActions } from "@/components/records/RecordActions";
import { ActivityTypePicker } from "@/components/status/ActivityTypePicker";
import {
  FATIGUE_SCALE_TICKS,
  fatigueTickLabel,
  formatActivityLabels,
  normalizeActivityTypes,
} from "@/lib/clinical/activityTypes";
import type { PostSaveFeedbackView } from "@/lib/clinical/postSaveFeedback";
import {
  deleteSessionFeedback,
  getSessionFeedbacks,
  saveSessionFeedback,
  updateSessionFeedback,
  type SessionFeedbackSaved,
} from "@/lib/status/feedbackActions";
import { getTeamTodayDateStr } from "@/lib/season/timeZone";
import {
  appendSessionFeedbackDraft,
  deleteSessionFeedbackDraft,
  latestUnsyncedFeedbackDraftId,
  loadFailedSessionFeedbackDrafts,
  loadPlayerSessionFeedbackDrafts,
  reconcileSessionFeedbackDrafts,
  updateSessionFeedbackDraft,
  type SessionFeedbackEntry,
} from "@/lib/sessionFeedback";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { draftScopeFromUser } from "@/lib/scopedStorage";
import { useSyncOutbox } from "@/hooks/useSyncOutbox";
import { PENDING_SYNC_COPY } from "@/lib/syncOutbox";
import FailedLocalDraftTray from "@/components/status/FailedLocalDraftTray";

const DEFAULT_ACTIVITY = ["batting"];

type ListedFeedback = {
  id: string;
  source: "cloud" | "local";
  activityTypes: string[];
  sessionRpe: number;
  note: string | null;
};

function fromCloud(entry: SessionFeedbackSaved): ListedFeedback {
  return { ...entry, source: "cloud" };
}

function fromLocal(entry: SessionFeedbackEntry): ListedFeedback {
  return {
    id: entry.id,
    source: "local",
    activityTypes: entry.activityTypes,
    sessionRpe: entry.sessionRpe,
    note: entry.note,
  };
}

export default function SessionFeedbackPage() {
  const { currentUser, isMounted } = useRequireAuth();
  const router = useRouter();
  const [activityTypes, setActivityTypes] = useState<string[]>(DEFAULT_ACTIVITY);
  const [sessionRpe, setSessionRpe] = useState(5);
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "local">(
    "idle"
  );
  const [view, setView] = useState<PostSaveFeedbackView | null>(null);
  const [entries, setEntries] = useState<ListedFeedback[]>([]);
  const [editing, setEditing] = useState<{
    id: string;
    source: "cloud" | "local";
  } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [failedLocal, setFailedLocal] = useState<SessionFeedbackEntry[]>([]);
  const [retryDraftId, setRetryDraftId] = useState<string | null>(null);

  const scope = draftScopeFromUser(currentUser);

  const resetForm = () => {
    setActivityTypes(DEFAULT_ACTIVITY);
    setSessionRpe(5);
    setNote("");
    setEditing(null);
  };

  const reloadList = async (playerId: string) => {
    const date = getTeamTodayDateStr(currentUser?.teamTimeZone);
    const res = await getSessionFeedbacks(date);
    const cloudEntries = res.success ? res.entries : [];
    if (!res.success) console.error("云端被拒:", res.error);
    reconcileSessionFeedbackDrafts(
      scope,
      playerId,
      date,
      cloudEntries.map((row) => ({
        id: row.id,
        clientDraftId: row.clientDraftId,
      }))
    );
    const cloud = cloudEntries.map(fromCloud);
    const local = loadPlayerSessionFeedbackDrafts(scope, playerId, date)
      .filter((draft) => !cloud.some((row) => row.id === draft.id))
      .map(fromLocal);
    setEntries([...cloud, ...local]);
    setFailedLocal(loadFailedSessionFeedbackDrafts(scope, playerId));
    setRetryDraftId(latestUnsyncedFeedbackDraftId(scope, playerId, date));
  };

  useSyncOutbox(scope, (result) => {
    if (result.feedbackSynced.length > 0 && currentUser?.playerId) {
      void reloadList(currentUser.playerId);
      setNotice("已同步到云端");
    }
  });

  useEffect(() => {
    if (!isMounted || !currentUser) return;
    if (currentUser.roles.includes("coach")) {
      router.replace("/coach");
      return;
    }
    if (!currentUser.playerId) return;
    const playerId = currentUser.playerId;
    const timer = window.setTimeout(() => {
      setEntries([]);
      resetForm();
      void reloadList(playerId);
    }, 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 按账号重载当日列表
  }, [isMounted, currentUser?.accountId, currentUser?.playerId, currentUser, router]);

  const handleSubmit = async () => {
    if (!currentUser?.playerId || status === "saving") return;
    const typesRes = normalizeActivityTypes(activityTypes);
    if (!typesRes.success) {
      setNotice(typesRes.error);
      return;
    }
    const playerId = currentUser.playerId;
    setStatus("saving");
    const date = getTeamTodayDateStr(currentUser.teamTimeZone);
    const noteTrimmed = note.trim() ? note.trim().slice(0, 200) : null;
    const payload = {
      date,
      activityTypes: typesRes.types,
      sessionRpe,
      note: noteTrimmed,
    };

    if (editing?.source === "local") {
      updateSessionFeedbackDraft(scope, editing.id, {
        activityTypes: typesRes.types,
        sessionRpe,
        note: noteTrimmed,
      });
      setStatus("local");
      await reloadList(playerId);
      resetForm();
      return;
    }

    if (editing?.source === "cloud") {
      const res = await updateSessionFeedback({ id: editing.id, ...payload });
      if (res.success) {
        setStatus("saved");
        setView(res.view);
        resetForm();
      } else {
        console.error("云端被拒:", res.error);
        setNotice(res.error);
        setStatus("idle");
        return;
      }
      await reloadList(playerId);
      return;
    }

    const clientDraftId = retryDraftId ?? crypto.randomUUID();
    const res = await saveSessionFeedback({
      ...payload,
      clientDraftId,
    });
    if (res.success) {
      deleteSessionFeedbackDraft(scope, clientDraftId);
      setRetryDraftId(null);
      setStatus("saved");
      setView(res.view);
      resetForm();
    } else {
      console.error("云端被拒:", res.error);
      appendSessionFeedbackDraft(scope, {
        id: clientDraftId,
        playerId,
        playerName: currentUser.playerName ?? currentUser.username,
        date,
        activityTypes: typesRes.types,
        sessionRpe,
        note: noteTrimmed,
      });
      setRetryDraftId(clientDraftId);
      setStatus("local");
      setNotice(PENDING_SYNC_COPY);
      resetForm();
    }
    await reloadList(playerId);
  };

  const handleBeginEdit = (item: ListedFeedback) => {
    setEditing({ id: item.id, source: item.source });
    setActivityTypes(
      item.activityTypes.length > 0 ? item.activityTypes : DEFAULT_ACTIVITY
    );
    setSessionRpe(item.sessionRpe);
    setNote(item.note ?? "");
    setView(null);
    setStatus("idle");
  };

  const handleDelete = async (item: ListedFeedback) => {
    if (!currentUser?.playerId) return;
    const playerId = currentUser.playerId;
    if (item.source === "local") {
      deleteSessionFeedbackDraft(scope, item.id);
    } else {
      const res = await deleteSessionFeedback({
        id: item.id,
      });
      if (!res.success) {
        console.error("云端被拒:", res.error);
        setNotice(res.error);
        return;
      }
    }
    if (editing?.id === item.id) resetForm();
    await reloadList(playerId);
  };

  if (!isMounted || !currentUser || currentUser.roles.includes("coach")) {
    return <PageLoading />;
  }
  const fatigueTip = fatigueTickLabel(sessionRpe);

  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 p-6">
      <main className="flex w-full max-w-2xl flex-col gap-4">
        <div className="text-center">
          <h1 className="text-sm font-medium tracking-wide text-zinc-500">
            训后反馈
          </h1>
          <p className="mt-1 text-xs text-zinc-400">
            当前球员：{currentUser.playerName}
          </p>
        </div>
        <MedicalDisclaimer />
        {notice ? (
          <p className="border border-zinc-300 bg-white p-3 text-sm text-zinc-700">
            {notice}
          </p>
        ) : null}
        <FailedLocalDraftTray
          items={failedLocal.map((entry) => ({
            id: entry.id,
            summary: `${entry.date} 训后反馈未上云${
              entry.failedReason ? ` · ${entry.failedReason}` : ""
            }`,
          }))}
          onDismiss={(id) => {
            deleteSessionFeedbackDraft(scope, id);
            setFailedLocal(loadFailedSessionFeedbackDrafts(scope, currentUser.playerId ?? undefined));
          }}
        />
        {entries.length > 0 ? (
          <ul className="flex flex-col gap-1 border border-zinc-200 bg-white p-3">
            {entries.map((item) => (
              <li
                key={`${item.source}-${item.id}`}
                className="flex items-start justify-between gap-2 text-xs text-zinc-600"
              >
                <span>
                  {formatActivityLabels(item.activityTypes)} · 疲劳{" "}
                  {item.sessionRpe}
                  {item.source === "local"
                    ? " · 待同步，本机未上云"
                    : ""}
                  {editing?.id === item.id ? " · 修改中" : ""}
                </span>
                <RecordActions
                  onEdit={() => handleBeginEdit(item)}
                  onDelete={() => void handleDelete(item)}
                  deleteConfirm="确认删除这条训后反馈？"
                />
              </li>
            ))}
          </ul>
        ) : null}
        <ActivityTypePicker
          selected={activityTypes}
          onChange={setActivityTypes}
        />
        <div className="flex flex-col gap-2 border border-zinc-200 p-4">
          <label className="text-xs uppercase text-gray-500">疲劳程度</label>
          <input
            type="range"
            min={1}
            max={10}
            step={1}
            value={sessionRpe}
            onChange={(e) => setSessionRpe(Number(e.target.value))}
            className="w-full accent-zinc-900"
          />
          <div className="flex justify-between px-0.5" aria-hidden>
            {FATIGUE_SCALE_TICKS.map((tick) => (
              <span key={tick.value} className="h-1.5 w-px bg-zinc-500" />
            ))}
          </div>
          <span className="text-right font-mono text-sm text-zinc-900">
            {sessionRpe}
            {fatigueTip ? ` · ${fatigueTip}` : ""}
          </span>
        </div>
        <div className="flex flex-col gap-2 border border-zinc-200 p-4">
          <label className="text-xs uppercase text-gray-500">备注（选填）</label>
          <textarea
            maxLength={200}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="min-h-20 border border-zinc-300 px-3 py-2 text-sm"
          />
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={status === "saving"}
            onClick={() => void handleSubmit()}
            className="flex-1 bg-black py-2 text-sm text-white hover:bg-zinc-800 disabled:bg-zinc-300"
          >
            {status === "saving"
              ? "提交中…"
              : editing
                ? "保存修改"
                : "提交训后反馈"}
          </button>
          {editing ? (
            <button
              type="button"
              onClick={resetForm}
              className="border border-zinc-300 px-4 py-2 text-sm"
            >
              取消
            </button>
          ) : null}
        </div>
        {view && (
          <div className="flex flex-col gap-2 border-2 border-zinc-900 bg-white p-4">
            <p className="text-sm text-zinc-700">{view.sessionLine}</p>
            {view.injuryContextVisible && (
              <p className="text-sm text-zinc-700">
                {view.injuryContextText}{" "}
                <Link href="/prehab" className="underline">
                  运动损伤
                </Link>
              </p>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
