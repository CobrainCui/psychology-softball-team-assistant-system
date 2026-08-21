"use client";

import { useCallback, useEffect, useState } from "react";
import PageLoading from "@/components/PageLoading";
import EventCard from "@/components/season/EventCard";
import MatchWindowBanner from "@/components/season/MatchWindowBanner";
import SeasonPanel from "@/components/season/SeasonPanel";
import { useRequireAuth } from "@/lib/useRequireAuth";
import { listGameFiles } from "@/lib/season/fileActions";
import {
  createScheduleEvent,
  listScheduleEvents,
} from "@/lib/season/scheduleActions";
import { listSeasons } from "@/lib/season/seasonActions";
import type { GameFileDto, ScheduleEventDto, SeasonDto } from "@/lib/season/types";

export default function SchedulePage() {
  const { currentUser, isMounted } = useRequireAuth();
  const [seasons, setSeasons] = useState<SeasonDto[]>([]);
  const [events, setEvents] = useState<ScheduleEventDto[]>([]);
  const [filesByEvent, setFilesByEvent] = useState<Record<string, GameFileDto[]>>(
    {}
  );
  const [error, setError] = useState("");
  const [kind, setKind] = useState<"game" | "scrimmage">("game");
  const [seasonId, setSeasonId] = useState("");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [title, setTitle] = useState("");

  const canManage = Boolean(
    currentUser?.roles.includes("captain") || currentUser?.roles.includes("coach")
  );

  const reload = useCallback(async () => {
    const [seasonRes, eventRes] = await Promise.all([
      listSeasons(),
      listScheduleEvents(),
    ]);
    if (!seasonRes.success) {
      setError(seasonRes.error);
      return;
    }
    if (!eventRes.success) {
      setError(eventRes.error);
      return;
    }
    setSeasons(seasonRes.seasons);
    setEvents(eventRes.events);
    const map: Record<string, GameFileDto[]> = {};
    for (const ev of eventRes.events) {
      const files = await listGameFiles(ev.id);
      map[ev.id] = files.success ? files.files : [];
    }
    setFilesByEvent(map);
    setError("");
  }, []);

  useEffect(() => {
    if (!isMounted || !currentUser) return;
    void reload();
  }, [isMounted, currentUser, reload]);

  if (!isMounted || !currentUser) return <PageLoading />;

  const active = seasons.find((s) => s.status === "active");

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-8">
      <h1 className="text-center text-sm font-medium tracking-wide text-zinc-500">
        赛程
      </h1>
      <MatchWindowBanner />
      {!active ? (
        <p className="text-sm text-zinc-500">
          当前非赛季。教学赛 / 自定义比赛不计入正式赛季统计。
        </p>
      ) : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <SeasonPanel seasons={seasons} canManage={canManage} onChanged={() => void reload()} />
      {canManage ? (
        <form
          className="grid gap-2 border border-zinc-200 bg-white p-4 text-sm sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            void createScheduleEvent({
              kind,
              seasonId: kind === "game" ? seasonId || active?.id || null : null,
              startAt: new Date(startAt).toISOString(),
              endAt: new Date(endAt).toISOString(),
              title,
            }).then((res) => {
              if (!res.success) {
                console.error("云端被拒:", res.error);
                setError(res.error);
                return;
              }
              void reload();
            });
          }}
        >
          <select
            className="border border-zinc-300 px-2 py-1"
            value={kind}
            onChange={(e) => setKind(e.target.value as "game" | "scrimmage")}
          >
            <option value="game">正式比赛</option>
            <option value="scrimmage">教学赛 / 自定义比赛</option>
          </select>
          {kind === "game" ? (
            <select
              className="border border-zinc-300 px-2 py-1"
              value={seasonId || active?.id || ""}
              onChange={(e) => setSeasonId(e.target.value)}
            >
              {seasons
                .filter((s) => s.status !== "archived")
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
            </select>
          ) : (
            <span className="text-xs text-zinc-500 self-center">不挂赛季</span>
          )}
          <input
            type="datetime-local"
            className="border border-zinc-300 px-2 py-1"
            value={startAt}
            onChange={(e) => setStartAt(e.target.value)}
            required
          />
          <input
            type="datetime-local"
            className="border border-zinc-300 px-2 py-1"
            value={endAt}
            onChange={(e) => setEndAt(e.target.value)}
            required
          />
          <input
            className="border border-zinc-300 px-2 py-1 sm:col-span-2"
            placeholder="标题 / 对手"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <button type="submit" className="bg-black px-3 py-1 text-white">
            添加事件
          </button>
        </form>
      ) : null}
      <div className="flex flex-col gap-2">
        {events.map((event) => (
          <EventCard
            key={event.id}
            event={event}
            files={filesByEvent[event.id] ?? []}
            currentUserId={currentUser.accountId}
            canManage={canManage}
            canUpload={
              Boolean(currentUser.playerId) &&
              (event.status === "planned" || event.status === "completed")
            }
            onChanged={() => void reload()}
          />
        ))}
      </div>
    </main>
  );
}
