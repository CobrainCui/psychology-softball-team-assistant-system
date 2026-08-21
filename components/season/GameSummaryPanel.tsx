"use client";

import { useEffect, useState } from "react";
import { getPlayers } from "@/lib/actions";
import { confirmGameSummary, getCurrentGameSummary } from "@/lib/season/summaryActions";
import type { GameFileDto, GameResultKind, GameSummaryDto } from "@/lib/season/types";

export default function GameSummaryPanel({
  eventId,
  files,
  canManage,
}: {
  eventId: string;
  files: GameFileDto[];
  canManage: boolean;
}) {
  const [summary, setSummary] = useState<GameSummaryDto | null>(null);
  const [ourScore, setOurScore] = useState("");
  const [oppScore, setOppScore] = useState("");
  const [result, setResult] = useState<GameResultKind>("unknown");
  const [sourceFileId, setSourceFileId] = useState("");
  const [playerIds, setPlayerIds] = useState<{ id: string; name: string }[]>([]);
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [error, setError] = useState("");

  useEffect(() => {
    void getCurrentGameSummary(eventId).then((res) => {
      if (res.success) setSummary(res.summary);
    });
    void getPlayers().then((res) => {
      if (res.success) {
        setPlayerIds(res.players.map((p) => ({ id: p.id, name: p.name })));
      }
    });
  }, [eventId]);

  if (!canManage && !summary) {
    return <p className="mt-2 text-xs text-zinc-400">尚无确认比赛摘要</p>;
  }

  return (
    <div className="mt-3 border-t border-zinc-100 pt-3 text-sm">
      <p className="text-xs uppercase text-zinc-500">确认摘要</p>
      {summary ? (
        <p className="mt-1">
          {summary.result} · {summary.ourScore ?? "—"}-{summary.opponentScore ?? "—"} · v
          {summary.version}
        </p>
      ) : (
        <p className="mt-1 text-zinc-400">未确认</p>
      )}
      {error ? <p className="text-red-600">{error}</p> : null}
      {canManage ? (
        <form
          className="mt-2 grid gap-2 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            void confirmGameSummary({
              eventId,
              ourScore: ourScore === "" ? null : Number(ourScore),
              opponentScore: oppScore === "" ? null : Number(oppScore),
              result,
              sourceFileId: sourceFileId || null,
              lines: playerIds.map((p) => ({
                playerId: p.id,
                participated: Boolean(picked[p.id]),
              })),
            }).then((res) => {
              if (!res.success) {
                console.error("云端被拒:", res.error);
                setError(res.error);
                return;
              }
              setError("");
              setSummary(res.summary);
            });
          }}
        >
          <input
            className="border border-zinc-300 px-2 py-1"
            placeholder="我方"
            value={ourScore}
            onChange={(e) => setOurScore(e.target.value)}
          />
          <input
            className="border border-zinc-300 px-2 py-1"
            placeholder="对方"
            value={oppScore}
            onChange={(e) => setOppScore(e.target.value)}
          />
          <select
            className="border border-zinc-300 px-2 py-1"
            value={result}
            onChange={(e) => setResult(e.target.value as GameResultKind)}
          >
            <option value="unknown">未知</option>
            <option value="win">胜</option>
            <option value="loss">负</option>
            <option value="tie">平</option>
          </select>
          <select
            className="border border-zinc-300 px-2 py-1"
            value={sourceFileId}
            onChange={(e) => setSourceFileId(e.target.value)}
          >
            <option value="">无源文件</option>
            {files.map((f) => (
              <option key={f.id} value={f.id}>
                {f.originalName}
              </option>
            ))}
          </select>
          <div className="sm:col-span-2 flex flex-wrap gap-2">
            {playerIds.map((p) => (
              <label key={p.id} className="text-xs">
                <input
                  type="checkbox"
                  className="mr-1"
                  checked={Boolean(picked[p.id])}
                  onChange={(e) =>
                    setPicked((cur) => ({ ...cur, [p.id]: e.target.checked }))
                  }
                />
                {p.name}
              </label>
            ))}
          </div>
          <button type="submit" className="bg-black px-3 py-1 text-white">
            确认
          </button>
        </form>
      ) : null}
    </div>
  );
}
