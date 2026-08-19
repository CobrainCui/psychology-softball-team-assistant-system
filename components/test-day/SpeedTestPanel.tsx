"use client";

import { useState } from "react";
import type { Player } from "@/lib/players";
import type { SpeedColumn, SpeedMark } from "@/lib/gameArchive";
import { isDefaultSpeedColumnId } from "@/lib/testDay/speedGrid";

interface SpeedTestPanelProps {
  assignedPlayers: Player[];
  columns: SpeedColumn[];
  marks: SpeedMark[];
  onMarkChange: (
    playerId: string,
    playerName: string,
    columnId: string,
    raw: string
  ) => void;
  onAddColumn: (name: string) => boolean;
  onRemoveColumn: (columnId: string) => void;
}

export default function SpeedTestPanel({
  assignedPlayers,
  columns,
  marks,
  onMarkChange,
  onAddColumn,
  onRemoveColumn,
}: SpeedTestPanelProps) {
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");

  if (assignedPlayers.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-zinc-400">
        暂无队员被分配至该测试项目，请前往左侧排阵指挥中心勾选
      </p>
    );
  }

  const sortedColumns = [...columns].sort((a, b) => a.sortOrder - b.sortOrder);

  const findSeconds = (playerId: string, columnId: string): string => {
    const mark = marks.find(
      (row) => row.playerId === playerId && row.columnId === columnId
    );
    return mark ? String(mark.seconds) : "";
  };

  const handleConfirmAdd = () => {
    const ok = onAddColumn(newName);
    if (!ok) return;
    setNewName("");
    setAdding(false);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto border border-zinc-300">
        <table className="min-w-full border-collapse text-xs">
          <thead>
            <tr className="bg-zinc-100">
              <th className="sticky left-0 z-10 border border-zinc-300 bg-zinc-100 px-2 py-2 text-left">
                队员
              </th>
              {sortedColumns.map((column) => (
                <th
                  key={column.id}
                  className="min-w-[5.5rem] border border-zinc-300 px-2 py-2 text-center"
                >
                  <div className="font-bold text-zinc-900">{column.name}</div>
                  <div className="text-[10px] text-zinc-500">秒</div>
                  {!isDefaultSpeedColumnId(column.id) ? (
                    <button
                      type="button"
                      onClick={() => {
                        if (!confirm(`确认删除测试项「${column.name}」？`)) return;
                        onRemoveColumn(column.id);
                      }}
                      className="mt-1 border border-red-300 px-1 py-0.5 text-[10px] font-normal text-red-600 hover:bg-red-50"
                    >
                      删除
                    </button>
                  ) : null}
                </th>
              ))}
              <th className="border border-zinc-300 px-2 py-2">
                <button
                  type="button"
                  onClick={() => setAdding(true)}
                  className="flex h-8 w-8 items-center justify-center border border-zinc-400 text-lg leading-none hover:bg-zinc-100"
                  title="添加跑垒测试项目"
                >
                  +
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {assignedPlayers.map((player) => (
              <tr key={player.id}>
                <td className="sticky left-0 z-10 border border-zinc-300 bg-white px-2 py-2 font-medium text-zinc-900">
                  {player.name}
                </td>
                {sortedColumns.map((column) => (
                  <td
                    key={`${player.id}-${column.id}`}
                    className="border border-zinc-300 px-1 py-1"
                  >
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="—"
                      value={findSeconds(player.id, column.id)}
                      onChange={(e) =>
                        onMarkChange(
                          player.id,
                          player.name,
                          column.id,
                          e.target.value
                        )
                      }
                      className="w-full min-w-[4rem] border border-zinc-300 bg-white px-1 py-1 text-center text-sm text-zinc-900"
                    />
                  </td>
                ))}
                <td className="border border-zinc-300 bg-zinc-50" />
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {adding ? (
        <div className="flex flex-col gap-2 border border-zinc-300 bg-gray-50 p-3">
          <p className="text-xs text-zinc-600">添加跑垒测试项目</p>
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="项目名称，例如：本垒打跑"
            className="w-full border border-zinc-300 bg-white px-2 py-1.5 text-sm"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleConfirmAdd}
              className="flex-1 bg-black py-2 text-sm text-white hover:bg-zinc-800"
            >
              确认添加
            </button>
            <button
              type="button"
              onClick={() => {
                setAdding(false);
                setNewName("");
              }}
              className="flex-1 border border-zinc-300 py-2 text-sm hover:bg-zinc-100"
            >
              取消
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
