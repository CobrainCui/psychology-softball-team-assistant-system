"use client";

import { useEffect, useState } from "react";
import { type Player } from "@/lib/players";
import { loginOrRegister } from "@/lib/actions";
import {
  type FlyCatchAttempt,
  type HitQuality,
  type HitRecord,
  type HitResult,
  type PitchCall,
  type PitchType,
  type SpeedColumn,
  type SpeedMark,
  type StrikeJudgeCell,
  type StrikeJudgeColumn,
  type ThrowPlay,
  type ThrowTestItem,
} from "@/lib/gameArchive";
import { playersAssignedTo } from "@/lib/testDay/rosterHelpers";
import {
  type Assignments,
  clearSessionDraft,
  DEFAULT_TEST_ITEMS,
  isDefaultTestItem,
  loadSessionDraft,
  saveSessionDraft,
  SESSION_DRAFT_SCHEMA_VERSION,
} from "@/lib/sessionDraft";
import {
  buildAssignmentCommitSummary,
  cloneAssignments,
  diffAssignments,
  type AssignmentCommit,
} from "@/lib/testDay/assignmentLog";
import { ADD_CUSTOM_TEST_PANEL_ID } from "@/components/test-day/hitLabels";
import {
  createDefaultSpeedColumns,
  isDefaultSpeedColumnId,
  parseSpeedSeconds,
} from "@/lib/testDay/speedGrid";

export interface PendingHit {
  x: number;
  y: number;
}

export type SidebarMode = "byPlayer" | "byTest";

export function useTestDaySession() {
  const [hits, setHits] = useState<HitRecord[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [currentResult, setCurrentResult] = useState<HitResult>("LD");
  const [currentBatterId, setCurrentBatterId] = useState("");
  const [isMounted, setIsMounted] = useState(false);
  const [pendingHit, setPendingHit] = useState<PendingHit | null>(null);
  const [currentPitchType, setCurrentPitchType] = useState<PitchType>("FB");
  const [currentHitQuality, setCurrentHitQuality] =
    useState<HitQuality>("Medium");
  const [activeTab, setActiveTab] = useState<string | null>("T座打击");
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>("byPlayer");
  const [assignments, setAssignments] = useState<Assignments>({});
  const [testItems, setTestItems] = useState<string[]>([...DEFAULT_TEST_ITEMS]);
  const [customTestName, setCustomTestName] = useState("");
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
  const [assignmentLocked, setAssignmentLocked] = useState(false);
  const [committedAssignments, setCommittedAssignments] = useState<Assignments>(
    {}
  );
  const [assignmentLog, setAssignmentLog] = useState<AssignmentCommit[]>([]);
  const [editingHitId, setEditingHitId] = useState<string | null>(null);
  const [editingFlyCatchId, setEditingFlyCatchId] = useState<string | null>(
    null
  );

  // 名册由 app/page.tsx 通过 getPlayers() 注入；此处只恢复当场草稿
  useEffect(() => {
    const draft = loadSessionDraft();
    setHits(draft.hits);
    setSpeedColumns(draft.speedColumns);
    setSpeedMarks(draft.speedMarks);
    setAssignments(draft.assignments);
    setTestItems(draft.testItems);
    setAssignmentLocked(draft.assignmentLocked);
    setCommittedAssignments(draft.committedAssignments);
    setAssignmentLog(draft.assignmentLog);
    setFlyCatchAttempts(draft.flyCatchAttempts);
    setStrikeJudgeColumns(draft.strikeJudgeColumns);
    setStrikeJudgeCells(draft.strikeJudgeCells);
    setThrowPlays(draft.throwPlays);
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!isMounted) return;
    saveSessionDraft({
      schemaVersion: SESSION_DRAFT_SCHEMA_VERSION,
      hits,
      speedRecords: [],
      speedColumns,
      speedMarks,
      assignments,
      testItems,
      assignmentLocked,
      committedAssignments,
      assignmentLog,
      flyCatchAttempts,
      strikeJudgeColumns,
      strikeJudgeCells,
      throwPlays,
    });
  }, [
    hits,
    speedColumns,
    speedMarks,
    assignments,
    testItems,
    assignmentLocked,
    committedAssignments,
    assignmentLog,
    flyCatchAttempts,
    strikeJudgeColumns,
    strikeJudgeCells,
    throwPlays,
    isMounted,
  ]);

  const currentBatter = players.find((player) => player.id === currentBatterId);
  const batterHits = hits.filter((hit) => hit.playerId === currentBatterId);
  const isEntryPanelActive = currentResult === "MISS" || pendingHit !== null;
  const showPitchQualityPanel = currentResult !== "MISS" && pendingHit !== null;
  const plottableHits = batterHits.filter(
    (hit) => hit.result !== "MISS" && hit.id !== editingHitId
  );

  const speedTestAssignedPlayers = playersAssignedTo(
    "上垒速度",
    players,
    assignments
  );
  const flyCatchAssignedPlayers = playersAssignedTo(
    "接高飞",
    players,
    assignments
  );
  const strikeJudgePlayers = playersAssignedTo("好球判断", players, assignments);
  const pitcherPlayers = playersAssignedTo("投手", players, assignments);
  const firstBasePlayers = playersAssignedTo("一垒", players, assignments);
  const throw63Players = playersAssignedTo("6-3传球", players, assignments);
  const throw43Players = playersAssignedTo("4-3传球", players, assignments);

  const handleFieldClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (currentResult === "MISS") return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setPendingHit({ x, y });
  };

  const handleConfirmHit = () => {
    if (!currentBatter || !isEntryPanelActive) return;

    // 推导步骤：有 editingHitId 则覆盖同 id；否则追加新打点
    const nextHit: HitRecord = {
      id: editingHitId ?? crypto.randomUUID(),
      ...(pendingHit ? { x: pendingHit.x, y: pendingHit.y } : {}),
      result: currentResult,
      playerId: currentBatter.id,
      playerName: currentBatter.name,
      ...(currentResult !== "MISS"
        ? { pitchType: currentPitchType, hitQuality: currentHitQuality }
        : {}),
      timestamp: Date.now(),
    };

    setHits((prev) => {
      if (!editingHitId) return [...prev, nextHit];
      return prev.map((hit) => (hit.id === editingHitId ? nextHit : hit));
    });
    setPendingHit(null);
    setEditingHitId(null);
    setCurrentHitQuality("Medium");
  };

  const handleSelectResult = (result: HitResult) => {
    setCurrentResult(result);
    if (result === "MISS") setPendingHit(null);
  };

  const handleCancelHit = () => {
    setPendingHit(null);
    setEditingHitId(null);
  };

  const handleBeginEditHit = (hitId: string) => {
    const hit = hits.find((row) => row.id === hitId);
    if (!hit) return;
    setCurrentBatterId(hit.playerId);
    setCurrentResult(hit.result);
    setEditingHitId(hit.id);
    if (hit.result === "MISS") {
      setPendingHit(null);
    } else {
      setPendingHit({ x: hit.x ?? 0, y: hit.y ?? 0 });
    }
    if (hit.pitchType) setCurrentPitchType(hit.pitchType as PitchType);
    if (hit.hitQuality) setCurrentHitQuality(hit.hitQuality as HitQuality);
  };

  const handleDeleteHit = (hitId: string) => {
    setHits((prev) => prev.filter((hit) => hit.id !== hitId));
    if (editingHitId === hitId) {
      setPendingHit(null);
      setEditingHitId(null);
    }
  };

  const handleToggleTab = (tab: string) => {
    setActiveTab((prev) => (prev === tab ? null : tab));
  };

  const handleToggleAssignment = (playerId: string, testItem: string) => {
    if (assignmentLocked) return;
    setAssignments((prev) => {
      const current = prev[playerId] ?? [];
      const nextForPlayer = current.includes(testItem)
        ? current.filter((item) => item !== testItem)
        : [...current, testItem];
      return { ...prev, [playerId]: nextForPlayer };
    });
  };

  const handleSelectAllTestsForPlayer = (playerId: string) => {
    if (assignmentLocked) return;
    setAssignments((prev) => {
      const current = prev[playerId] ?? [];
      const allSelected =
        testItems.length > 0 &&
        testItems.every((item) => current.includes(item));
      return {
        ...prev,
        [playerId]: allSelected ? [] : [...testItems],
      };
    });
  };

  const handleSelectAllPlayersForTest = (testItem: string) => {
    if (assignmentLocked) return;
    setAssignments((prev) => {
      const allSelected =
        players.length > 0 &&
        players.every((player) => (prev[player.id] ?? []).includes(testItem));
      const next = { ...prev };
      players.forEach((player) => {
        const current = next[player.id] ?? [];
        if (allSelected) {
          next[player.id] = current.filter((item) => item !== testItem);
        } else if (!current.includes(testItem)) {
          next[player.id] = [...current, testItem];
        }
      });
      return next;
    });
  };

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

  const handleInitStrikeJudgeColumns = () => {
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
    setStrikeJudgeColumns((prev) => {
      const remaining = prev
        .filter((column) => column.id !== columnId)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((column, index) => ({ ...column, sortOrder: index }));
      return remaining;
    });
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

  const handleAddCustomTest = () => {
    const trimmedName = customTestName.trim();
    if (!trimmedName) return;
    if (testItems.includes(trimmedName)) {
      window.alert("该测试项目已存在，请勿重复添加。");
      return;
    }
    setTestItems((prev) => [...prev, trimmedName]);
    setCustomTestName("");
  };

  const handleRemoveCustomTest = (testItem: string) => {
    if (isDefaultTestItem(testItem)) return;
    if (assignmentLocked) return;
    setTestItems((prev) => prev.filter((item) => item !== testItem));
    setAssignments((prev) => {
      const next: Assignments = {};
      for (const [playerId, items] of Object.entries(prev)) {
        next[playerId] = items.filter((item) => item !== testItem);
      }
      return next;
    });
    if (activeTab === testItem) setActiveTab(null);
  };

  // 推导步骤：对比上次提交快照 → 写一条报名/修改记录 → 锁定勾选
  const handleSaveAssignments = (author: string, note: string): boolean => {
    if (assignmentLocked) return false;
    const trimmedAuthor = author.trim();
    if (!trimmedAuthor) {
      window.alert("请填写修改人。");
      return false;
    }
    const { added, removed } = diffAssignments(
      committedAssignments,
      assignments
    );
    const isRevision = assignmentLog.length > 0;
    if (!isRevision && added.length === 0) {
      window.alert("请先勾选测试报名后再保存。");
      return false;
    }
    if (isRevision && added.length === 0 && removed.length === 0) {
      window.alert("排阵未改动，无需保存。");
      return false;
    }
    const trimmedNote = note.trim();
    const summary = buildAssignmentCommitSummary({
      author: trimmedAuthor,
      isRevision,
      added,
      removed,
      note: trimmedNote || undefined,
      players,
    });
    setAssignmentLog((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        author: trimmedAuthor,
        note: trimmedNote || undefined,
        summary,
        added,
        removed,
        timestamp: Date.now(),
      },
    ]);
    setCommittedAssignments(cloneAssignments(assignments));
    setAssignmentLocked(true);
    return true;
  };

  const handleBeginEditAssignments = () => {
    if (!assignmentLocked) return;
    setAssignmentLocked(false);
  };

  const handleUndo = () => {
    const lastIndex = hits.findLastIndex(
      (hit) => hit.playerId === currentBatterId
    );
    if (lastIndex === -1) return;
    setHits((prev) => prev.filter((_, index) => index !== lastIndex));
  };

  const handleClearAll = () => {
    if (!currentBatter) return;
    if (
      !confirm(`确认清空「${currentBatter.name}」的全部打击记录？此操作不可撤销。`)
    ) {
      return;
    }
    setHits((prev) => prev.filter((hit) => hit.playerId !== currentBatterId));
  };

  const handleAddPlayer = async () => {
    const name = window.prompt("请输入新队员名字:");
    if (!name || !name.trim()) return;

    const genderRaw = window.prompt("请输入性别（男 / 女）:", "女");
    if (!genderRaw) return;
    const normalized = genderRaw.trim();
    const gender =
      normalized === "男" || normalized.toLowerCase() === "male"
        ? ("male" as const)
        : normalized === "女" || normalized.toLowerCase() === "female"
          ? ("female" as const)
          : null;
    if (!gender) {
      window.alert("性别仅支持填写「男」或「女」。");
      return;
    }

    const res = await loginOrRegister(name.trim(), gender, "player");
    if (!res.success) {
      console.error("云端被拒:", res.error);
      window.alert(`创建队员失败：${res.error}`);
      return;
    }
    setPlayers((prev) => [...prev, res.player]);
    setCurrentBatterId(res.player.id);
  };

  const clearBoardAfterArchive = () => {
    setHits([]);
    setSpeedColumns(createDefaultSpeedColumns());
    setSpeedMarks([]);
    setFlyCatchAttempts([]);
    setFlyCatchNoteDrafts({});
    setStrikeJudgeColumns([]);
    setStrikeJudgeCells([]);
    setThrowPlays([]);
    setAssignments({});
    setAssignmentLocked(false);
    setCommittedAssignments({});
    setAssignmentLog([]);
    setPendingHit(null);
    setEditingHitId(null);
    setEditingFlyCatchId(null);
    clearSessionDraft();
  };

  return {
    ADD_CUSTOM_TEST_PANEL_ID,
    players,
    setPlayers,
    hits,
    speedColumns,
    speedMarks,
    flyCatchAttempts,
    flyCatchNoteDrafts,
    strikeJudgeColumns,
    strikeJudgeCells,
    throwPlays,
    assignmentLocked,
    assignmentLog,
    committedAssignments,
    assignments,
    testItems,
    customTestName,
    setCustomTestName,
    currentBatterId,
    setCurrentBatterId,
    clearBoardAfterArchive,
    currentResult,
    currentPitchType,
    setCurrentPitchType,
    currentHitQuality,
    setCurrentHitQuality,
    pendingHit,
    editingHitId,
    editingFlyCatchId,
    activeTab,
    sidebarMode,
    setSidebarMode,
    batterHits,
    plottableHits,
    isEntryPanelActive,
    showPitchQualityPanel,
    speedTestAssignedPlayers,
    flyCatchAssignedPlayers,
    strikeJudgePlayers,
    pitcherPlayers,
    firstBasePlayers,
    throw63Players,
    throw43Players,
    handleFieldClick,
    handleConfirmHit,
    handleSelectResult,
    handleCancelHit,
    handleToggleTab,
    handleToggleAssignment,
    handleSelectAllTestsForPlayer,
    handleSelectAllPlayersForTest,
    handleSaveAssignments,
    handleBeginEditAssignments,
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
    handleAddCustomTest,
    handleRemoveCustomTest,
    handleBeginEditHit,
    handleDeleteHit,
    handleUndo,
    handleClearAll,
    handleAddPlayer,
  };
}
