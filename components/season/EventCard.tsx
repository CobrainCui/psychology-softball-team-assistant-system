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
  const run = async (fn: () => Promise<{ success: boolean; error?: string }>) => {
    const res = await fn();
    if (!res.success) {
      console.error("云端被拒:", res.error);
      setError(res.error ?? "失败");
      return;
    }
    setError("");
    onChanged();
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
            <div className="mt-2 flex flex-wrap gap-2">
              {event.status === "planned" ? (
                <>
                  <button
                    type="button"
                    className="border border-zinc-300 px-2 py-0.5 text-xs"
                    onClick={() => {
                      const reason = window.prompt("取消原因");
                      if (!reason) return;
                      void run(() => cancelScheduleEvent(event.id, reason));
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
                    const reason = window.prompt("重开原因");
                    if (!reason) return;
                    void run(() => reopenScheduleEvent(event.id, reason));
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
