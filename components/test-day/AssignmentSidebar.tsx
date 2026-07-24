"use client";

import type { Player } from "@/lib/players";
import type { Assignments } from "@/lib/sessionDraft";
import type { SidebarMode } from "@/hooks/useTestDaySession";

interface AssignmentSidebarProps {
  players: Player[];
  testItems: string[];
  assignments: Assignments;
  sidebarMode: SidebarMode;
  onSidebarModeChange: (mode: SidebarMode) => void;
  onAddPlayer: () => void;
  onToggleAssignment: (playerId: string, testItem: string) => void;
  onSelectAllTestsForPlayer: (playerId: string) => void;
  onSelectAllPlayersForTest: (testItem: string) => void;
}

export default function AssignmentSidebar({
  players,
  testItems,
  assignments,
  sidebarMode,
  onSidebarModeChange,
  onAddPlayer,
  onToggleAssignment,
  onSelectAllTestsForPlayer,
  onSelectAllPlayersForTest,
}: AssignmentSidebarProps) {
  return (
    <aside className="w-full shrink-0 rounded-md border border-zinc-200 bg-gray-50 p-4 md:w-80">
      <div className="flex flex-col gap-4">
        <h2 className="text-sm font-medium tracking-wide text-zinc-500">
          排阵指挥中心
        </h2>

        <button
          onClick={onAddPlayer}
          className="w-full border border-zinc-300 bg-white py-2 text-sm text-zinc-700 transition-colors hover:bg-zinc-100"
        >
          + 临时新增队员
        </button>

        <div className="flex border border-zinc-900">
          <button
            type="button"
            onClick={() => onSidebarModeChange("byPlayer")}
            className={`flex-1 py-2 text-xs font-bold transition-colors ${
              sidebarMode === "byPlayer"
                ? "bg-zinc-900 text-white"
                : "bg-white text-zinc-500 hover:bg-zinc-100"
            }`}
          >
            按队员排阵
          </button>
          <button
            type="button"
            onClick={() => onSidebarModeChange("byTest")}
            className={`flex-1 py-2 text-xs font-bold transition-colors ${
              sidebarMode === "byTest"
                ? "bg-zinc-900 text-white"
                : "bg-white text-zinc-500 hover:bg-zinc-100"
            }`}
          >
            按测试排阵
          </button>
        </div>

        {players.length === 0 ? (
          <p className="py-4 text-center text-xs text-zinc-400">
            暂无队员，请点击上方新增
          </p>
        ) : sidebarMode === "byPlayer" ? (
          <div className="flex flex-col gap-3">
            {players.map((player) => (
              <div
                key={player.id}
                className="rounded border border-zinc-200 bg-white p-3"
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-sm font-bold text-zinc-900">{player.name}</p>
                  <button
                    type="button"
                    onClick={() => onSelectAllTestsForPlayer(player.id)}
                    className="shrink-0 px-2 py-1 text-xs text-zinc-400 transition-colors hover:text-zinc-700"
                  >
                    全选
                  </button>
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-1.5">
                  {testItems.map((item) => (
                    <label
                      key={item}
                      className="flex items-center gap-1.5 text-xs text-zinc-700"
                    >
                      <input
                        type="checkbox"
                        className="h-3.5 w-3.5 accent-zinc-900"
                        checked={assignments[player.id]?.includes(item) ?? false}
                        onChange={() => onToggleAssignment(player.id, item)}
                      />
                      {item}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {testItems.map((item) => (
              <div
                key={item}
                className="rounded border border-zinc-200 bg-white p-3"
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-sm font-bold text-zinc-900">{item}</p>
                  <button
                    type="button"
                    onClick={() => onSelectAllPlayersForTest(item)}
                    className="shrink-0 px-2 py-1 text-xs text-zinc-400 transition-colors hover:text-zinc-700"
                  >
                    全选
                  </button>
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-1.5">
                  {players.map((player) => (
                    <label
                      key={player.id}
                      className="flex items-center gap-1.5 text-xs text-zinc-700"
                    >
                      <input
                        type="checkbox"
                        className="h-3.5 w-3.5 accent-zinc-900"
                        checked={
                          assignments[player.id]?.includes(item) ?? false
                        }
                        onChange={() => onToggleAssignment(player.id, item)}
                      />
                      {player.name}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
