"use client";

import type { Player } from "@/lib/players";
import type { SpeedRecord } from "@/lib/gameArchive";
import type { SpeedInputs } from "@/hooks/useTestDaySession";

interface SpeedTestPanelProps {
  assignedPlayers: Player[];
  speedRecords: SpeedRecord[];
  speedInputs: SpeedInputs;
  onSpeedInputChange: (
    playerId: string,
    field: "firstBase" | "secondBase" | "custom",
    value: string
  ) => void;
  onRecordSpeed: (playerId: string, playerName: string) => void;
}

export default function SpeedTestPanel({
  assignedPlayers,
  speedRecords,
  speedInputs,
  onSpeedInputChange,
  onRecordSpeed,
}: SpeedTestPanelProps) {
  if (assignedPlayers.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-zinc-400">
        暂无队员被分配至该测试项目，请前往左侧排阵指挥中心勾选
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {assignedPlayers.map((player) => {
        const hasRecorded = speedRecords.some(
          (record) => record.playerId === player.id
        );
        const rowInput = speedInputs[player.id] ?? {
          firstBase: "",
          secondBase: "",
          custom: "",
        };

        return (
          <div
            key={player.id}
            className={`flex flex-wrap items-center gap-2 border p-2 text-sm ${
              hasRecorded
                ? "border-zinc-200 bg-zinc-50"
                : "border-zinc-300 bg-white"
            }`}
          >
            <span className="w-20 shrink-0 truncate font-bold text-zinc-900">
              {player.name}
            </span>
            <input
              type="number"
              step="0.01"
              min="0"
              placeholder="上一垒(秒)"
              disabled={hasRecorded}
              value={rowInput.firstBase}
              onChange={(e) =>
                onSpeedInputChange(player.id, "firstBase", e.target.value)
              }
              className="w-24 border border-zinc-300 px-2 py-1 text-sm text-zinc-900 disabled:opacity-40"
            />
            <input
              type="number"
              step="0.01"
              min="0"
              placeholder="上二垒(秒)"
              disabled={hasRecorded}
              value={rowInput.secondBase}
              onChange={(e) =>
                onSpeedInputChange(player.id, "secondBase", e.target.value)
              }
              className="w-24 border border-zinc-300 px-2 py-1 text-sm text-zinc-900 disabled:opacity-40"
            />
            <input
              type="number"
              step="0.01"
              min="0"
              placeholder="自定义(秒)"
              disabled={hasRecorded}
              value={rowInput.custom}
              onChange={(e) =>
                onSpeedInputChange(player.id, "custom", e.target.value)
              }
              className="w-24 border border-zinc-300 px-2 py-1 text-sm text-zinc-900 disabled:opacity-40"
            />
            <button
              type="button"
              onClick={() => onRecordSpeed(player.id, player.name)}
              disabled={hasRecorded}
              className={`shrink-0 px-2 py-1 text-xs font-bold transition-colors ${
                hasRecorded
                  ? "border border-zinc-300 text-zinc-400"
                  : "bg-black text-white hover:bg-zinc-800"
              }`}
            >
              {hasRecorded ? "✔ 已录入" : "✅ 记录"}
            </button>
          </div>
        );
      })}
    </div>
  );
}
