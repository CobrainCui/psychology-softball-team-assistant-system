"use client";

import { useState } from "react";
import type { Player } from "@/lib/players";
import type { Assignments } from "@/lib/sessionDraft";
import {
  buildAssignmentCommitDetailLines,
  buildAssignmentCommitHeadline,
  type AssignmentCommit,
} from "@/lib/testDay/assignmentLog";
import type { SidebarMode } from "@/hooks/useTestDaySession";
import type { NewRosterPlayerInput } from "@/hooks/testDaySessionTypes";
import { useSession } from "@/lib/useSession";

function formatCommitTime(timestamp: number): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "";
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${month}月${day}日 ${hours}:${minutes}`;
}

interface AssignmentSidebarProps {
  players: Player[];
  testItems: string[];
  assignments: Assignments;
  assignmentLocked: boolean;
  assignmentLog: AssignmentCommit[];
  sidebarMode: SidebarMode;
  onSidebarModeChange: (mode: SidebarMode) => void;
  onAddPlayer?: (input: NewRosterPlayerInput) => void | Promise<void>;
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
  const { user: currentUser } = useSession();
  const [author, setAuthor] = useState("");
  const [note, setNote] = useState("");
  const [addingPlayer, setAddingPlayer] = useState(false);
  const [newPlayerName, setNewPlayerName] = useState("");
  const [newPlayerGender, setNewPlayerGender] = useState<"female" | "male">(
    "female"
  );
  const [expandedLogIds, setExpandedLogIds] = useState<Record<string, boolean>>(
    {}
  );

  const resolvedAuthor =
    author.trim() ||
    currentUser?.playerName ||
    currentUser?.username ||
    "";

  const handleSave = () => {
    const ok = onSaveAssignments(resolvedAuthor, note);
    if (ok) setNote("");
  };

  return (
    <aside className="w-full shrink-0 rounded-md border border-zinc-200 bg-gray-50 p-4 md:w-80">
      <div className="flex flex-col gap-4">
        <h2 className="text-sm font-medium tracking-wide text-zinc-500">
          排阵指挥中心
        </h2>

        {onAddPlayer ? (
          addingPlayer ? (
            <form
              className="flex flex-col gap-2 border border-zinc-300 bg-white p-2"
              onSubmit={(event) => {
                event.preventDefault();
                const name = newPlayerName.trim();
                if (!name) return;
                void onAddPlayer({ name, gender: newPlayerGender });
                setNewPlayerName("");
                setAddingPlayer(false);
              }}
            >
              <input
                type="text"
                value={newPlayerName}
                onChange={(event) => setNewPlayerName(event.target.value)}
                placeholder="姓名"
                className="w-full border border-zinc-300 px-2 py-1.5 text-sm text-zinc-900"
              />
              <select
                value={newPlayerGender}
                onChange={(event) =>
                  setNewPlayerGender(event.target.value as "female" | "male")
                }
                className="w-full border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900"
              >
                <option value="female">女</option>
                <option value="male">男</option>
              </select>
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="flex-1 bg-black py-1.5 text-xs text-white hover:bg-zinc-800"
                >
                  添加
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAddingPlayer(false);
                    setNewPlayerName("");
                  }}
                  className="flex-1 border border-zinc-400 py-1.5 text-xs text-zinc-800 hover:bg-zinc-100"
                >
                  取消
                </button>
              </div>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setAddingPlayer(true)}
              className="w-full border border-zinc-300 bg-white py-2 text-sm text-zinc-700 transition-colors hover:bg-zinc-100"
            >
              + 临时新增队员
            </button>
          )
        ) : null}

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
            value={author || resolvedAuthor}
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
              {assignmentLog.map((entry, index) => {
                const expanded = expandedLogIds[entry.id] === true;
                const details = buildAssignmentCommitDetailLines({
                  added: entry.added,
                  removed: entry.removed,
                  note: entry.note,
                  players,
                });
                return (
                  <li
                    key={entry.id}
                    className="border border-zinc-200 bg-white px-2 py-1.5"
                  >
                    <button
                      type="button"
                      aria-expanded={expanded}
                      onClick={() =>
                        setExpandedLogIds((prev) => ({
                          ...prev,
                          [entry.id]: !expanded,
                        }))
                      }
                      className="flex w-full items-center gap-2 text-left"
                    >
                      <span className="min-w-0 flex-1 leading-relaxed">
                        {buildAssignmentCommitHeadline(
                          entry.author,
                          index > 0
                        )}
                        <span className="ml-2 text-zinc-400">
                          {formatCommitTime(entry.timestamp)}
                        </span>
                      </span>
                      <span
                        className={`inline-block shrink-0 text-xs leading-none text-zinc-500 transition-transform ${
                          expanded ? "" : "-rotate-90"
                        }`}
                      >
                        ▼
                      </span>
                    </button>
                    {expanded && details.length > 0 ? (
                      <ul className="mt-1.5 flex flex-col gap-0.5 border-t border-zinc-100 pt-1.5 text-zinc-500">
                        {details.map((line) => (
                          <li key={line}>{line}</li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
      </div>
    </aside>
  );
}
