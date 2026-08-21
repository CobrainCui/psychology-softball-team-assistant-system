"use client";

import { useState } from "react";
import { RecordActions } from "@/components/records/RecordActions";
import {
  activateSeason,
  archiveSeason,
  createSeason,
  deleteSeason,
} from "@/lib/season/seasonActions";
import type { SeasonDto } from "@/lib/season/types";

export default function SeasonPanel({
  seasons,
  canManage,
  onChanged,
}: {
  seasons: SeasonDto[];
  canManage: boolean;
  onChanged: () => void;
}) {
  const [name, setName] = useState("");
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
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
    <section className="border border-zinc-200 bg-white p-4">
      <h2 className="text-sm font-medium">赛季</h2>
      {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
      <ul className="mt-3 space-y-2 text-sm">
        {seasons.map((season) => (
          <li
            key={season.id}
            className="flex items-start justify-between gap-2 border border-zinc-100 px-3 py-2"
          >
            <div>
              <p className="font-medium">
                {season.name} · {season.status}
              </p>
              <p className="text-xs text-zinc-500">
                {season.startsOn} – {season.effectiveEndsOn}
                {season.endsOn !== season.effectiveEndsOn
                  ? `（计划至 ${season.endsOn}）`
                  : ""}
              </p>
            </div>
            {canManage ? (
              <div className="flex flex-col items-end gap-1">
                {season.status === "planned" ? (
                  <button
                    type="button"
                    className="border border-zinc-300 px-2 py-0.5 text-xs"
                    onClick={() => run(() => activateSeason(season.id))}
                  >
                    开启
                  </button>
                ) : null}
                {season.status === "active" ? (
                  <button
                    type="button"
                    className="border border-zinc-300 px-2 py-0.5 text-xs"
                    onClick={() => run(() => archiveSeason(season.id))}
                  >
                    归档
                  </button>
                ) : null}
                {season.status === "planned" ? (
                  <RecordActions
                    onDelete={() => run(() => deleteSeason(season.id))}
                    deleteConfirm="确认删除该计划赛季？"
                  />
                ) : null}
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      {canManage ? (
        <form
          className="mt-4 grid gap-2 text-sm sm:grid-cols-4"
          onSubmit={(e) => {
            e.preventDefault();
            void run(() => createSeason({ name, startsOn, endsOn }));
          }}
        >
          <input
            className="border border-zinc-300 px-2 py-1"
            placeholder="名称"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <input
            type="date"
            className="border border-zinc-300 px-2 py-1"
            value={startsOn}
            onChange={(e) => setStartsOn(e.target.value)}
            required
          />
          <input
            type="date"
            className="border border-zinc-300 px-2 py-1"
            value={endsOn}
            onChange={(e) => setEndsOn(e.target.value)}
            required
          />
          <button type="submit" className="bg-black px-3 py-1 text-white">
            新建赛季
          </button>
        </form>
      ) : null}
    </section>
  );
}
