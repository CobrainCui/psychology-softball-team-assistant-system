"use client";

import { useState } from "react";
import Link from "next/link";
import { RecordActions } from "@/components/records/RecordActions";
import GameFilesPanel from "@/components/season/GameFilesPanel";
import GameSummaryPanel from "@/components/season/GameSummaryPanel";
import {
  cancelScheduleEvent,
  completeScheduleEvent,
  deleteScheduleEvent,
  reopenScheduleEvent,
} from "@/lib/season/scheduleActions";
import type { GameFileDto, ScheduleEventDto } from "@/lib/season/types";

export default function EventCard({
  event,
  files,
  currentUserId,
  canManage,
  canUpload,
  onChanged,
}: {
  event: ScheduleEventDto;
  files: GameFileDto[];
  currentUserId: string;
  canManage: boolean;
  canUpload: boolean;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [reasonMode, setReasonMode] = useState<"cancel" | "reopen" | null>(
    null
  );
  const [reasonDraft, setReasonDraft] = useState("");
  const run = async (fn: () => Promise<{ success: boolean; error?: string }>) => {
    const res = await fn();
    if (!res.success) {
      console.error("云端被拒:", res.error);
      setError(res.error ?? "失败");
      return;
    }
    setError("");
    setReasonMode(null);
    setReasonDraft("");
    onChanged();
  };

  const submitReason = () => {
    const note = reasonDraft.trim();
    if (!note) {
      setError(reasonMode === "reopen" ? "重开须填写原因" : "取消须填写原因");
      return;
    }
    if (reasonMode === "reopen") {
      void run(() => reopenScheduleEvent(event.id, note));
      return;
    }
    void run(() => cancelScheduleEvent(event.id, note));
  };

  return (
    <article className="border border-zinc-200 bg-white">
      <button
        type="button"
        className="flex w-full justify-between px-4 py-3 text-left text-sm"
        onClick={() => setOpen((v) => !v)}
      >
        <span>
          {event.kind === "scrimmage" ? "教学赛" : "比赛"} ·{" "}
          {event.title || event.opponent || "未命名"}
        </span>
        <span className="text-zinc-500">{event.status}</span>
      </button>
      {open ? (
        <div className="px-4 pb-4 text-sm">
          <p className="text-zinc-500">
            {new Date(event.startAt).toLocaleString("zh-CN")} –{" "}
            {new Date(event.endAt).toLocaleString("zh-CN")}
          </p>
          {event.statusNote ? (
            <p className="text-xs text-zinc-500">原因：{event.statusNote}</p>
          ) : null}
          {error ? <p className="text-red-600">{error}</p> : null}
          {canManage ? (
            <div className="mt-2 flex flex-col gap-2">
              {reasonMode ? (
                <form
                  className="flex flex-col gap-2"
                  onSubmit={(eventSubmit) => {
                    eventSubmit.preventDefault();
                    submitReason();
                  }}
                >
                  <input
                    type="text"
                    value={reasonDraft}
                    onChange={(change) => setReasonDraft(change.target.value)}
                    placeholder={
                      reasonMode === "reopen" ? "重开原因" : "取消原因"
                    }
                    className="border border-zinc-300 px-2 py-1 text-xs text-zinc-900"
                  />
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="submit"
                      className="border border-zinc-900 px-2 py-0.5 text-xs"
                    >
                      {reasonMode === "reopen" ? "确认重开" : "确认取消"}
                    </button>
                    <button
                      type="button"
                      className="border border-zinc-300 px-2 py-0.5 text-xs"
                      onClick={() => {
                        setReasonMode(null);
                        setReasonDraft("");
                        setError("");
                      }}
                    >
                      返回
                    </button>
                  </div>
                </form>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {event.status === "planned" ? (
                    <>
                      <button
                        type="button"
                        className="border border-zinc-300 px-2 py-0.5 text-xs"
                        onClick={() => {
                          setError("");
                          setReasonDraft("");
                          setReasonMode("cancel");
                        }}
                      >
                        取消
                      </button>
                      <button
                        type="button"
                        className="border border-zinc-300 px-2 py-0.5 text-xs"
                        onClick={() => run(() => completeScheduleEvent(event.id))}
                      >
                        完成
                      </button>
                      <RecordActions
                        onDelete={() => run(() => deleteScheduleEvent(event.id))}
                        deleteConfirm="确认删除该赛程？"
                      />
                    </>
                  ) : null}
                  {event.status === "cancelled" ? (
                    <button
                      type="button"
                      className="border border-zinc-300 px-2 py-0.5 text-xs"
                      onClick={() => {
                        setError("");
                        setReasonDraft("");
                        setReasonMode("reopen");
                      }}
                    >
                      重开
                    </button>
                  ) : null}
                  {event.status === "completed" ? (
                    <Link
                      href={`/schedule/import/${event.id}`}
                      className="border border-zinc-300 px-2 py-0.5 text-xs"
                    >
                      iScore 导入
                    </Link>
                  ) : null}
                </div>
              )}
            </div>
          ) : null}
          <GameFilesPanel
            eventId={event.id}
            files={files}
            currentUserId={currentUserId}
            canManage={canManage}
            canUpload={canUpload}
            onChanged={onChanged}
          />
          <GameSummaryPanel
            eventId={event.id}
            files={files}
            canManage={canManage}
          />
        </div>
      ) : null}
    </article>
  );
}
