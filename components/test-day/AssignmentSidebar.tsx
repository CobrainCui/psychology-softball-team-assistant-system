"use client";

import { useEffect, useState } from "react";
import type { Player } from "@/lib/players";
import type { Assignments } from "@/lib/sessionDraft";
import type { AssignmentCommit } from "@/lib/testDay/assignmentLog";
import type { SidebarMode } from "@/hooks/useTestDaySession";
import { useCurrentUser } from "@/lib/currentUser";

interface AssignmentSidebarProps {
  players: Player[];
  testItems: string[];
  assignments: Assignments;
  assignmentLocked: boolean;
  assignmentLog: AssignmentCommit[];
  sidebarMode: SidebarMode;
  onSidebarModeChange: (mode: SidebarMode) => void;
  onAddPlayer: () => void;
  onToggleAssignment: (playerId: string, testItem: string) => void;
  onSelectAllTestsForPlayer: (playerId: string) => void;
  onSelectAllPlayersForTest: (testItem: string) => void;
  onSaveAssignments: (author: string, note: string) => boolean;
  onBeginEditAssignments: () => void;
}

export default function AssignmentSidebar({
  players,
  testItems,
  assignments,
  assignmentLocked,
  assignmentLog,
  sidebarMode,
  onSidebarModeChange,
  onAddPlayer,
  onToggleAssignment,
  onSelectAllTestsForPlayer,
  onSelectAllPlayersForTest,
  onSaveAssignments,
  onBeginEditAssignments,
}: AssignmentSidebarProps) {
  const { currentUser, isMounted } = useCurrentUser();
  const [author, setAuthor] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!isMounted || !currentUser?.playerName) return;
    setAuthor((prev) => (prev.trim() ? prev : currentUser.playerName));
  }, [isMounted, currentUser]);

  const handleSave = () => {
    const ok = onSaveAssignments(author, note);
    if (ok) setNote("");
  };

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
                    disabled={assignmentLocked}
                    className="shrink-0 px-2 py-1 text-xs text-zinc-400 transition-colors hover:text-zinc-700 disabled:text-zinc-300"
                  >
                    全选
                  </button>
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-1.5">
                  {testItems.map((item) => (
                    <label
                      key={item}
                      className={`flex items-center gap-1.5 text-xs ${
                        assignmentLocked ? "text-zinc-400" : "text-zinc-700"
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="h-3.5 w-3.5 accent-zinc-900"
                        disabled={assignmentLocked}
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
                    disabled={assignmentLocked}
                    className="shrink-0 px-2 py-1 text-xs text-zinc-400 transition-colors hover:text-zinc-700 disabled:text-zinc-300"
                  >
                    全选
                  </button>
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-1.5">
                  {players.map((player) => (
                    <label
                      key={player.id}
                      className={`flex items-center gap-1.5 text-xs ${
                        assignmentLocked ? "text-zinc-400" : "text-zinc-700"
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="h-3.5 w-3.5 accent-zinc-900"
                        disabled={assignmentLocked}
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

        <div className="flex flex-col gap-2 border-t border-zinc-200 pt-3">
          <p className="text-xs text-zinc-500">
            {assignmentLocked
              ? "已保存 · 点击修改后才能改勾选"
              : assignmentLog.length > 0
                ? "修改中 · 保存后写入修改记录"
                : "未保存 · 勾选后填写修改人并保存"}
          </p>
          <input
            type="text"
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            disabled={assignmentLocked}
            placeholder="修改人"
            className="w-full border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900 disabled:bg-zinc-100 disabled:text-zinc-500"
          />
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={assignmentLocked}
            placeholder="备注（可选）"
            className="w-full border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900 disabled:bg-zinc-100 disabled:text-zinc-500"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={assignmentLocked}
              className="flex-1 bg-black py-2 text-sm text-white hover:bg-zinc-800 disabled:bg-zinc-300 disabled:text-zinc-500"
            >
              保存
            </button>
            <button
              type="button"
              onClick={onBeginEditAssignments}
              disabled={!assignmentLocked}
              className="flex-1 border border-zinc-400 py-2 text-sm text-zinc-800 hover:bg-zinc-100 disabled:border-zinc-200 disabled:text-zinc-400"
            >
              修改
            </button>
          </div>
        </div>

        {assignmentLog.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            <p className="text-xs font-medium tracking-wide text-zinc-500">
              修改记录
            </p>
            <ul className="flex max-h-48 flex-col gap-1.5 overflow-y-auto text-xs text-zinc-600">
              {assignmentLog.map((entry) => (
                <li
                  key={entry.id}
                  className="border border-zinc-200 bg-white px-2 py-1.5 leading-relaxed"
                >
                  {entry.summary}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </aside>
  );
}
