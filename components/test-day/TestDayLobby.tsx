"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  createTestDayDraft,
  joinTestDayDraft,
  listOpenTestDayDrafts,
} from "@/lib/testDay/draftActions";
import { listArchivedTestSessions } from "@/lib/testDay/sessionReadActions";
import type { TestDayDraftListItem } from "@/lib/testDay/collab/dto";
import type { ArchivedSessionListItem } from "@/lib/testDay/sessionReadActions";
import { useSession } from "@/lib/useSession";
import { canArchiveTestSessionFromUser } from "@/lib/auth/policy";
import RetryNotice from "@/components/test-day/RetryNotice";

function statusLabel(status: TestDayDraftListItem["status"]): string {
  if (status === "open") return "进行中";
  if (status === "frozen") return "已冻结";
  return "已归档";
}

export default function TestDayLobby() {
  const router = useRouter();
  const { user } = useSession();
  const canCreate = canArchiveTestSessionFromUser(user);
  const [drafts, setDrafts] = useState<TestDayDraftListItem[]>([]);
  const [archived, setArchived] = useState<ArchivedSessionListItem[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    const [live, history] = await Promise.all([
      listOpenTestDayDrafts(),
      listArchivedTestSessions(),
    ]);
    if (!live.success) {
      console.error("云端被拒:", live.error);
      setError(live.error);
      setDrafts([]);
    } else {
      setDrafts(live.drafts);
      setError("");
    }
    if (!history.success) {
      console.error("云端被拒:", history.error);
      setArchived([]);
      if (live.success) setError(history.error);
      return;
    }
    setArchived(history.sessions);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void reload();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [reload]);

  const handleCreate = async () => {
    setBusy(true);
    const res = await createTestDayDraft();
    setBusy(false);
    if (!res.success) {
      console.error("云端被拒:", res.error);
      setError(res.error);
      return;
    }
    router.push(`/test-day/${res.id}`);
  };

  const handleJoin = async (draftId: string) => {
    setBusy(true);
    const res = await joinTestDayDraft(draftId);
    setBusy(false);
    if (!res.success) {
      console.error("云端被拒:", res.error);
      setError(res.error);
      return;
    }
    router.push(`/test-day/${draftId}`);
  };

  return (
    <section className="mx-auto w-full max-w-5xl px-4 pt-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-sm font-medium tracking-wide text-zinc-500">
          测试日大厅
        </h1>
        {canCreate ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleCreate()}
            className="bg-black px-3 py-1.5 text-sm text-white hover:bg-zinc-800 disabled:bg-zinc-400"
          >
            创建云端场次
          </button>
        ) : null}
      </div>
      <p className="mt-1 text-xs text-zinc-500">
        进行中以云端场次为准。本机草稿仅供单设备恢复，不能作为正式成绩。
      </p>
      {error ? (
        <div className="mt-2">
          <RetryNotice message={error} onRetry={() => void reload()} />
        </div>
      ) : null}
      {drafts.length === 0 ? (
        <p className="mt-4 border border-zinc-300 bg-white px-4 py-6 text-center text-sm text-zinc-500">
          暂无进行中的云端场次。
        </p>
      ) : (
        <ul className="mt-4 flex flex-col gap-2">
          {drafts.map((draft) => (
            <li
              key={draft.id}
              className="flex items-center justify-between gap-3 border border-zinc-300 bg-white px-4 py-3"
            >
              <div>
                <p className="text-sm text-zinc-900">
                  {draft.date} · {statusLabel(draft.status)}
                </p>
                <p className="text-xs text-zinc-500">
                  {draft.memberCount} 人已加入
                  {draft.isMember ? " · 已加入" : ""}
                </p>
              </div>
              <div className="flex gap-2">
                {!draft.isMember && draft.status === "open" ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleJoin(draft.id)}
                    className="border border-zinc-400 px-3 py-1.5 text-sm text-zinc-800 hover:bg-zinc-100 disabled:text-zinc-400"
                  >
                    加入
                  </button>
                ) : null}
                {draft.isMember || draft.status === "open" ? (
                  <button
                    type="button"
                    onClick={() => router.push(`/test-day/${draft.id}`)}
                    className="bg-black px-3 py-1.5 text-sm text-white hover:bg-zinc-800"
                  >
                    {draft.isMember ? "进入" : "查看"}
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
      <h2 className="mt-8 text-sm font-medium tracking-wide text-zinc-500">
        已归档正式成绩
      </h2>
      {archived.length === 0 ? (
        <p className="mt-2 border border-zinc-300 bg-white px-4 py-4 text-center text-sm text-zinc-500">
          暂无归档场次。
        </p>
      ) : (
        <ul className="mt-2 flex flex-col gap-2">
          {archived.map((row) => (
            <li
              key={row.id}
              className="flex items-center justify-between gap-3 border border-zinc-300 bg-white px-4 py-3"
            >
              <p className="text-sm text-zinc-900">{row.date} · 只读</p>
              <button
                type="button"
                onClick={() => router.push(`/sessions/${row.id}`)}
                className="border border-zinc-400 px-3 py-1.5 text-sm text-zinc-800 hover:bg-zinc-100"
              >
                查看详情
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
