"use client";

import { useState } from "react";
import { RecordActions } from "@/components/records/RecordActions";
import {
  CUSTOM_RECORD_MODE_LABELS,
  type CustomGroupNote,
  type CustomPlayerNote,
  type CustomRecordMode,
  type CustomSingleNote,
} from "@/lib/testDay/customTests";

interface CustomTestPanelProps {
  testItem: string;
  mode: CustomRecordMode;
  assignedPlayers: { id: string; name: string }[];
  playerNotes: CustomPlayerNote[];
  groupNotes: CustomGroupNote[];
  singleNote: CustomSingleNote | undefined;
  onPlayerNoteChange: (
    playerId: string,
    playerName: string,
    note: string
  ) => void;
  onCreateGroup: (members: { id: string; name: string }[]) => boolean;
  onGroupNoteChange: (groupId: string, note: string) => void;
  onDeleteGroup: (groupId: string) => void;
  onSingleNoteChange: (note: string) => void;
}

export default function CustomTestPanel({
  testItem,
  mode,
  assignedPlayers,
  playerNotes,
  groupNotes,
  singleNote,
  onPlayerNoteChange,
  onCreateGroup,
  onGroupNoteChange,
  onDeleteGroup,
  onSingleNoteChange,
}: CustomTestPanelProps) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-zinc-500">
        记录方式：{CUSTOM_RECORD_MODE_LABELS[mode]}
      </p>
      {mode === "per_player" ? (
        <PerPlayerNotes
          assignedPlayers={assignedPlayers}
          playerNotes={playerNotes.filter((row) => row.testItem === testItem)}
          onPlayerNoteChange={onPlayerNoteChange}
        />
      ) : mode === "per_group" ? (
        <PerGroupNotes
          assignedPlayers={assignedPlayers}
          groupNotes={groupNotes.filter((row) => row.testItem === testItem)}
          onCreateGroup={onCreateGroup}
          onGroupNoteChange={onGroupNoteChange}
          onDeleteGroup={onDeleteGroup}
        />
      ) : (
        <SingleNoteBox
          note={singleNote?.note ?? ""}
          onNoteChange={onSingleNoteChange}
        />
      )}
    </div>
  );
}

function PerPlayerNotes({
  assignedPlayers,
  playerNotes,
  onPlayerNoteChange,
}: {
  assignedPlayers: { id: string; name: string }[];
  playerNotes: CustomPlayerNote[];
  onPlayerNoteChange: (
    playerId: string,
    playerName: string,
    note: string
  ) => void;
}) {
  if (assignedPlayers.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-zinc-400">
        暂无队员被分配至该测试项目，请前往左侧排阵指挥中心勾选
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {assignedPlayers.map((player) => {
        const row = playerNotes.find((note) => note.playerId === player.id);
        return (
          <div
            key={player.id}
            className="flex flex-col gap-2 border border-zinc-300 bg-white p-3"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-bold text-zinc-900">
                {player.name}
              </span>
              {row?.note.trim() ? (
                <RecordActions
                  onDelete={() =>
                    onPlayerNoteChange(player.id, player.name, "")
                  }
                  deleteConfirm={`确认删除「${player.name}」的备注？`}
                />
              ) : null}
            </div>
            <textarea
              value={row?.note ?? ""}
              onChange={(e) =>
                onPlayerNoteChange(player.id, player.name, e.target.value)
              }
              placeholder="备注"
              rows={3}
              className="w-full border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900"
            />
          </div>
        );
      })}
    </div>
  );
}

function PerGroupNotes({
  assignedPlayers,
  groupNotes,
  onCreateGroup,
  onGroupNoteChange,
  onDeleteGroup,
}: {
  assignedPlayers: { id: string; name: string }[];
  groupNotes: CustomGroupNote[];
  onCreateGroup: (members: { id: string; name: string }[]) => boolean;
  onGroupNoteChange: (groupId: string, note: string) => void;
  onDeleteGroup: (groupId: string) => void;
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  if (assignedPlayers.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-zinc-400">
        暂无队员被分配至该测试项目，请前往左侧排阵指挥中心勾选
      </p>
    );
  }

  const taken = new Set(groupNotes.flatMap((group) => group.memberIds));
  const ungrouped = assignedPlayers.filter((player) => !taken.has(player.id));

  const toggle = (playerId: string) => {
    setSelectedIds((prev) =>
      prev.includes(playerId)
        ? prev.filter((id) => id !== playerId)
        : [...prev, playerId]
    );
  };

  const handleCreate = () => {
    const members = ungrouped.filter((player) =>
      selectedIds.includes(player.id)
    );
    if (onCreateGroup(members)) setSelectedIds([]);
  };

  return (
    <div className="flex flex-col gap-3">
      {groupNotes.map((group) => (
        <div
          key={group.id}
          className="flex flex-col gap-2 border border-zinc-300 bg-white p-3"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-bold text-zinc-900">
              {group.memberNames.join("、")}
            </span>
            <RecordActions
              onDelete={() => onDeleteGroup(group.id)}
              deleteConfirm="确认删除这一组？"
            />
          </div>
          <textarea
            value={group.note}
            onChange={(e) => onGroupNoteChange(group.id, e.target.value)}
            placeholder="本组备注"
            rows={3}
            className="w-full border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900"
          />
        </div>
      ))}

      {ungrouped.length > 0 ? (
        <div className="flex flex-col gap-2 border border-dashed border-zinc-300 p-3">
          <p className="text-xs text-zinc-500">未分组 · 勾选至少两人后组成一组</p>
          <div className="flex flex-wrap gap-x-3 gap-y-1.5">
            {ungrouped.map((player) => (
              <label
                key={player.id}
                className="flex items-center gap-1.5 text-xs text-zinc-700"
              >
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 accent-zinc-900"
                  checked={selectedIds.includes(player.id)}
                  onChange={() => toggle(player.id)}
                />
                {player.name}
              </label>
            ))}
          </div>
          <button
            type="button"
            onClick={handleCreate}
            className="w-full bg-black py-2 text-sm text-white hover:bg-zinc-800"
          >
            组成一组
          </button>
        </div>
      ) : null}
    </div>
  );
}

function SingleNoteBox({
  note,
  onNoteChange,
}: {
  note: string;
  onNoteChange: (note: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      {note.trim() ? (
        <div className="flex justify-end">
          <RecordActions
            onDelete={() => onNoteChange("")}
            deleteConfirm="确认清空本项备注？"
          />
        </div>
      ) : null}
      <textarea
        value={note}
        onChange={(e) => onNoteChange(e.target.value)}
        placeholder="本项备注"
        rows={8}
        className="w-full border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
      />
    </div>
  );
}