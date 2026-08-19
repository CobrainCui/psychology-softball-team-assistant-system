"use client";

import { useState } from "react";
import type { FlyCatchAttempt } from "@/lib/gameArchive";
import { RecordActions } from "@/components/records/RecordActions";

interface FlyCatchPanelProps {
  assignedPlayers: { id: string; name: string }[];
  attempts: FlyCatchAttempt[];
  noteDrafts: Record<string, string>;
  editingAttemptId: string | null;
  onNoteDraftChange: (playerId: string, value: string) => void;
  onRecordAttempt: (
    playerId: string,
    playerName: string,
    caught: boolean
  ) => void;
  onBeginEdit: (attemptId: string) => void;
  onDeleteAttempt: (attemptId: string) => void;
  onUndoLast: (playerId: string) => void;
}

const DIGITS = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"];

function chineseOrdinal(n: number): string {
  if (n <= 0) return String(n);
  if (n < 10) return DIGITS[n];
  if (n === 10) return "十";
  if (n < 20) return `十${DIGITS[n % 10]}`;
  if (n < 100) {
    const tens = Math.floor(n / 10);
    const ones = n % 10;
    return `${DIGITS[tens]}十${ones === 0 ? "" : DIGITS[ones]}`;
  }
  return String(n);
}

function ballLabel(n: number): string {
  return `第${chineseOrdinal(n)}球`;
}

export default function FlyCatchPanel({
  assignedPlayers,
  attempts,
  noteDrafts,
  editingAttemptId,
  onNoteDraftChange,
  onRecordAttempt,
  onBeginEdit,
  onDeleteAttempt,
  onUndoLast,
}: FlyCatchPanelProps) {
  const [expandedByPlayer, setExpandedByPlayer] = useState<
    Record<string, boolean>
  >({});

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
        const isEditingThisPlayer = playerAttempts.some(
          (row) => row.id === editingAttemptId
        );
        const expanded = expandedByPlayer[player.id] === true;
        const nextBall = playerAttempts.length + 1;

        return (
          <div
            key={player.id}
            className="flex flex-col gap-2 border border-zinc-300 bg-white p-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-bold text-zinc-900">
                {player.name}
              </span>
              <div className="flex items-center gap-1">
                <span className="text-xs text-zinc-500">
                  接住 {caughtCount}/{playerAttempts.length}
                </span>
                <button
                  type="button"
                  aria-expanded={expanded}
                  aria-label={expanded ? "收起球次" : "展开球次"}
                  onClick={() =>
                    setExpandedByPlayer((prev) => ({
                      ...prev,
                      [player.id]: !expanded,
                    }))
                  }
                  className="flex h-6 w-6 items-center justify-center text-zinc-500 hover:text-zinc-900"
                >
                  <span
                    className={`inline-block text-[10px] leading-none transition-transform ${
                      expanded ? "" : "-rotate-90"
                    }`}
                  >
                    ▼
                  </span>
                </button>
              </div>
            </div>

            <input
              type="text"
              value={noteDrafts[player.id] ?? ""}
              onChange={(e) => onNoteDraftChange(player.id, e.target.value)}
              placeholder="备注（选填）"
              className="w-full border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-900"
            />

            <div className="flex flex-wrap items-center gap-2">
              <span className="w-14 shrink-0 text-sm font-medium text-zinc-800">
                {ballLabel(nextBall)}
              </span>
              <button
                type="button"
                onClick={() =>
                  onRecordAttempt(player.id, player.name, true)
                }
                className="flex-1 border border-zinc-900 bg-zinc-900 py-2 text-sm text-white hover:bg-zinc-800"
              >
                {isEditingThisPlayer ? "改为接住" : "接住"}
              </button>
              <button
                type="button"
                onClick={() =>
                  onRecordAttempt(player.id, player.name, false)
                }
                className="flex-1 border border-zinc-300 py-2 text-sm text-zinc-700 hover:bg-zinc-100"
              >
                {isEditingThisPlayer ? "改为没接住" : "没接住"}
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

            {expanded ? (
              playerAttempts.length > 0 ? (
                <ul className="flex flex-col gap-1 text-xs text-zinc-500">
                  {playerAttempts.map((row, index) => (
                    <li
                      key={row.id}
                      className="flex items-center justify-between gap-2"
                    >
                      <span>
                        {ballLabel(index + 1)} {row.caught ? "接住" : "没接住"}
                        {row.note ? ` · ${row.note}` : ""}
                        {editingAttemptId === row.id ? " · 修改中" : ""}
                      </span>
                      <RecordActions
                        onEdit={() => onBeginEdit(row.id)}
                        onDelete={() => onDeleteAttempt(row.id)}
                        deleteConfirm="确认删除这一球？"
                      />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-zinc-400">暂无球次</p>
              )
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
