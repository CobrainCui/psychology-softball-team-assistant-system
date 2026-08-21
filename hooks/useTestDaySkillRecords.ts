"use client";

import { useState } from "react";
import type {
  FlyCatchAttempt,
  PitchCall,
  SpeedColumn,
  SpeedMark,
  StrikeJudgeCell,
  StrikeJudgeColumn,
  ThrowPlay,
  ThrowTestItem,
} from "@/lib/gameArchive";
import {
  createDefaultSpeedColumns,
  isDefaultSpeedColumnId,
  parseSpeedSeconds,
} from "@/lib/testDay/speedGrid";

export function useTestDaySkillRecords() {
  const [speedColumns, setSpeedColumns] = useState<SpeedColumn[]>(
    createDefaultSpeedColumns()
  );
  const [speedMarks, setSpeedMarks] = useState<SpeedMark[]>([]);
  const [flyCatchAttempts, setFlyCatchAttempts] = useState<FlyCatchAttempt[]>(
    []
  );
  const [flyCatchNoteDrafts, setFlyCatchNoteDrafts] = useState<
    Record<string, string>
  >({});
  const [strikeJudgeColumns, setStrikeJudgeColumns] = useState<
    StrikeJudgeColumn[]
  >([]);
  const [strikeJudgeCells, setStrikeJudgeCells] = useState<StrikeJudgeCell[]>(
    []
  );
  const [throwPlays, setThrowPlays] = useState<ThrowPlay[]>([]);
  const [editingFlyCatchId, setEditingFlyCatchId] = useState<string | null>(
    null
  );

  const handleSpeedMarkChange = (
    playerId: string,
    playerName: string,
    columnId: string,
    raw: string
  ) => {
    const seconds = parseSpeedSeconds(raw);
    setSpeedMarks((prev) => {
      const without = prev.filter(
        (mark) => !(mark.playerId === playerId && mark.columnId === columnId)
      );
      if (seconds === null) return without;
      const existing = prev.find(
        (mark) => mark.playerId === playerId && mark.columnId === columnId
      );
      return [
        ...without,
        {
          id: existing?.id ?? crypto.randomUUID(),
          playerId,
          playerName,
          columnId,
          seconds,
          timestamp: Date.now(),
        },
      ];
    });
  };

  const handleAddSpeedColumn = (name: string): boolean => {
    const trimmed = name.trim();
    if (!trimmed) {
      window.alert("请输入测试项目名称。");
      return false;
    }
    if (speedColumns.some((column) => column.name === trimmed)) {
      window.alert("该测试项目已存在，请勿重复添加。");
      return false;
    }
    setSpeedColumns((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        name: trimmed,
        sortOrder: prev.length,
      },
    ]);
    return true;
  };

  const handleRemoveSpeedColumn = (columnId: string) => {
    if (isDefaultSpeedColumnId(columnId)) return;
    setSpeedColumns((prev) =>
      prev
        .filter((column) => column.id !== columnId)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((column, index) => ({ ...column, sortOrder: index }))
    );
    setSpeedMarks((prev) => prev.filter((mark) => mark.columnId !== columnId));
  };

  const handleFlyCatchNoteDraftChange = (playerId: string, value: string) => {
    setFlyCatchNoteDrafts((prev) => ({ ...prev, [playerId]: value }));
  };

  const handleRecordFlyCatch = (
    playerId: string,
    playerName: string,
    caught: boolean
  ) => {
    const note = flyCatchNoteDrafts[playerId]?.trim();
    const editing = editingFlyCatchId
      ? flyCatchAttempts.find((row) => row.id === editingFlyCatchId)
      : undefined;
    setFlyCatchAttempts((prev) => {
      if (editing && editing.playerId === playerId) {
        return prev.map((row) =>
          row.id === editing.id
            ? {
                ...row,
                caught,
                note: note || undefined,
                timestamp: Date.now(),
              }
            : row
        );
      }
      return [
        ...prev,
        {
          id: crypto.randomUUID(),
          playerId,
          playerName,
          caught,
          note: note || undefined,
          timestamp: Date.now(),
        },
      ];
    });
    if (editing && editing.playerId === playerId) setEditingFlyCatchId(null);
  };

  const handleBeginEditFlyCatch = (attemptId: string) => {
    const row = flyCatchAttempts.find((item) => item.id === attemptId);
    if (!row) return;
    setEditingFlyCatchId(row.id);
    setFlyCatchNoteDrafts((prev) => ({
      ...prev,
      [row.playerId]: row.note ?? "",
    }));
  };

  const handleDeleteFlyCatch = (attemptId: string) => {
    setFlyCatchAttempts((prev) => prev.filter((row) => row.id !== attemptId));
    if (editingFlyCatchId === attemptId) setEditingFlyCatchId(null);
  };

  const handleUndoFlyCatch = (playerId: string) => {
    const lastIndex = flyCatchAttempts.findLastIndex(
      (row) => row.playerId === playerId
    );
    if (lastIndex === -1) return;
    const removed = flyCatchAttempts[lastIndex];
    if (removed && editingFlyCatchId === removed.id) {
      setEditingFlyCatchId(null);
    }
    setFlyCatchAttempts((prev) =>
      prev.filter((_, index) => index !== lastIndex)
    );
  };

  const handleAddStrikeJudgeColumn = (
    pitcherId: string,
    pitcherName: string
  ) => {
    setStrikeJudgeColumns((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        pitcherId,
        pitcherName,
        sortOrder: prev.length,
      },
    ]);
  };

  const handleInitStrikeJudgeColumns = (
    pitcherPlayers: { id: string; name: string }[]
  ) => {
    setStrikeJudgeColumns(
      pitcherPlayers.map((player, index) => ({
        id: crypto.randomUUID(),
        pitcherId: player.id,
        pitcherName: player.name,
        sortOrder: index,
      }))
    );
  };

  const handleReorderStrikeJudgeColumns = (
    fromIndex: number,
    toIndex: number
  ) => {
    setStrikeJudgeColumns((prev) => {
      const sorted = [...prev].sort((a, b) => a.sortOrder - b.sortOrder);
      if (
        fromIndex < 0 ||
        toIndex < 0 ||
        fromIndex >= sorted.length ||
        toIndex >= sorted.length
      ) {
        return prev;
      }
      const [moved] = sorted.splice(fromIndex, 1);
      sorted.splice(toIndex, 0, moved);
      return sorted.map((column, index) => ({ ...column, sortOrder: index }));
    });
  };

  const handleUpsertStrikeJudgeCell = (
    columnId: string,
    judgeId: string,
    judgeName: string,
    pitchCall: PitchCall,
    swung: boolean
  ) => {
    setStrikeJudgeCells((prev) => {
      const existingIndex = prev.findIndex(
        (cell) => cell.columnId === columnId && cell.judgeId === judgeId
      );
      const nextCell: StrikeJudgeCell = {
        columnId,
        judgeId,
        judgeName,
        pitchCall,
        swung,
        timestamp: Date.now(),
      };
      if (existingIndex === -1) return [...prev, nextCell];
      const next = [...prev];
      next[existingIndex] = nextCell;
      return next;
    });
  };

  const handleClearStrikeJudgeCell = (columnId: string, judgeId: string) => {
    setStrikeJudgeCells((prev) =>
      prev.filter(
        (cell) => !(cell.columnId === columnId && cell.judgeId === judgeId)
      )
    );
  };

  const handleRemoveStrikeJudgeColumn = (columnId: string) => {
    setStrikeJudgeColumns((prev) =>
      prev
        .filter((column) => column.id !== columnId)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((column, index) => ({ ...column, sortOrder: index }))
    );
    setStrikeJudgeCells((prev) =>
      prev.filter((cell) => cell.columnId !== columnId)
    );
  };

  const handleUpsertThrowPlay = (play: ThrowPlay) => {
    setThrowPlays((prev) => {
      const index = prev.findIndex(
        (row) =>
          row.testItem === play.testItem &&
          row.throwerId === play.throwerId &&
          row.firstBaseId === play.firstBaseId
      );
      if (index === -1) return [...prev, play];
      const next = [...prev];
      next[index] = play;
      return next;
    });
  };

  const handleClearThrowPlay = (
    testItem: ThrowTestItem,
    throwerId: string,
    firstBaseId: string
  ) => {
    setThrowPlays((prev) =>
      prev.filter(
        (play) =>
          !(
            play.testItem === testItem &&
            play.throwerId === throwerId &&
            play.firstBaseId === firstBaseId
          )
      )
    );
  };

  const resetSkillRecords = () => {
    setSpeedColumns(createDefaultSpeedColumns());
    setSpeedMarks([]);
    setFlyCatchAttempts([]);
    setFlyCatchNoteDrafts({});
    setStrikeJudgeColumns([]);
    setStrikeJudgeCells([]);
    setThrowPlays([]);
    setEditingFlyCatchId(null);
  };

  return {
    speedColumns,
    setSpeedColumns,
    speedMarks,
    setSpeedMarks,
    flyCatchAttempts,
    setFlyCatchAttempts,
    flyCatchNoteDrafts,
    strikeJudgeColumns,
    setStrikeJudgeColumns,
    strikeJudgeCells,
    setStrikeJudgeCells,
    throwPlays,
    setThrowPlays,
    editingFlyCatchId,
    handleSpeedMarkChange,
    handleAddSpeedColumn,
    handleRemoveSpeedColumn,
    handleFlyCatchNoteDraftChange,
    handleRecordFlyCatch,
    handleBeginEditFlyCatch,
    handleDeleteFlyCatch,
    handleUndoFlyCatch,
    handleAddStrikeJudgeColumn,
    handleInitStrikeJudgeColumns,
    handleReorderStrikeJudgeColumns,
    handleUpsertStrikeJudgeCell,
    handleClearStrikeJudgeCell,
    handleRemoveStrikeJudgeColumn,
    handleUpsertThrowPlay,
    handleClearThrowPlay,
    resetSkillRecords,
  };
}
