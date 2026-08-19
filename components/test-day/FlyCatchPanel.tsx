"use client";

import type { FlyCatchAttempt } from "@/lib/gameArchive";

interface FlyCatchPanelProps {
  assignedPlayers: { id: string; name: string }[];
  attempts: FlyCatchAttempt[];
  noteDrafts: Record<string, string>;
  onNoteDraftChange: (playerId: string, value: string) => void;
  onRecordAttempt: (
    playerId: string,
    playerName: string,
    caught: boolean
  ) => void;
  onUndoLast: (playerId: string) => void;
}

export default function FlyCatchPanel({
  assignedPlayers,
  attempts,
  noteDrafts,
  onNoteDraftChange,
  onRecordAttempt,
  onUndoLast,
}: FlyCatchPanelProps) {
  if (assignedPlayers.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-zinc-400">
        暂无队员被分配至该测试项目，请前往左侧排阵指挥中心勾选
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {assignedPlayers.map((player) => {
        const playerAttempts = attempts.filter(
          (row) => row.playerId === player.id
        );
        const caughtCount = playerAttempts.filter((row) => row.caught).length;

        return (
          <div
            key={player.id}
            className="flex flex-col gap-2 border border-zinc-300 bg-white p-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-bold text-zinc-900">
                {player.name}
              </span>
              <span className="text-xs text-zinc-500">
                接住 {caughtCount}/{playerAttempts.length}
              </span>
            </div>

            <input
              type="text"
              value={noteDrafts[player.id] ?? ""}
              onChange={(e) => onNoteDraftChange(player.id, e.target.value)}
              placeholder="备注（选填）"
              className="w-full border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-900"
            />

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() =>
                  onRecordAttempt(player.id, player.name, true)
                }
                className="flex-1 border border-zinc-900 bg-zinc-900 py-2 text-sm text-white hover:bg-zinc-800"
              >
                接住
              </button>
              <button
                type="button"
                onClick={() =>
                  onRecordAttempt(player.id, player.name, false)
                }
                className="flex-1 border border-zinc-300 py-2 text-sm text-zinc-700 hover:bg-zinc-100"
              >
                没接住
              </button>
              <button
                type="button"
                onClick={() => onUndoLast(player.id)}
                disabled={playerAttempts.length === 0}
                className="border border-zinc-300 px-3 py-2 text-xs text-zinc-600 hover:bg-zinc-100 disabled:text-zinc-400"
              >
                撤销上一球
              </button>
            </div>

            {playerAttempts.length > 0 ? (
              <ul className="flex flex-col gap-1 text-xs text-zinc-500">
                {playerAttempts.map((row, index) => (
                  <li key={row.id}>
                    #{index + 1} {row.caught ? "接住" : "没接住"}
                    {row.note ? ` · ${row.note}` : ""}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
