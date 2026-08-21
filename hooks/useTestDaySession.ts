"use client";

import { useEffect, useState } from "react";
import { type Player } from "@/lib/players";
import { createRosterPlayer } from "@/lib/actions";
import { playersAssignedTo } from "@/lib/testDay/rosterHelpers";
import {
  accordionTestItems,
  clearSessionDraft,
  loadSessionDraft,
  saveSessionDraft,
  SESSION_DRAFT_SCHEMA_VERSION,
} from "@/lib/sessionDraft";
import { ADD_CUSTOM_TEST_PANEL_ID } from "@/components/test-day/hitLabels";
import { useTestDayHits } from "@/hooks/useTestDayHits";
import { useTestDayAssignments } from "@/hooks/useTestDayAssignments";
import { useTestDaySkillRecords } from "@/hooks/useTestDaySkillRecords";
import type { PendingHit, SidebarMode } from "@/hooks/testDaySessionTypes";

export type { PendingHit, SidebarMode };

export function useTestDaySession() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [currentBatterId, setCurrentBatterId] = useState("");
  const [isMounted, setIsMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<string | null>("T座打击");

  const hits = useTestDayHits(currentBatterId);
  const assignments = useTestDayAssignments();
  const skills = useTestDaySkillRecords();

  // 名册由 app/page.tsx 通过 getPlayers() 注入；此处只恢复当场草稿
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const draft = loadSessionDraft();
      hits.setHits(draft.hits);
      skills.setSpeedColumns(draft.speedColumns);
      skills.setSpeedMarks(draft.speedMarks);
      assignments.setAssignments(draft.assignments);
      assignments.setTestItems(draft.testItems);
      assignments.setAssignmentLocked(draft.assignmentLocked);
      assignments.setCommittedAssignments(draft.committedAssignments);
      assignments.setAssignmentLog(draft.assignmentLog);
      skills.setFlyCatchAttempts(draft.flyCatchAttempts);
      skills.setStrikeJudgeColumns(draft.strikeJudgeColumns);
      skills.setStrikeJudgeCells(draft.strikeJudgeCells);
      skills.setThrowPlays(draft.throwPlays);
      assignments.setCustomSlice({
        customTestDefs: draft.customTestDefs,
        customPlayerNotes: draft.customPlayerNotes,
        customGroupNotes: draft.customGroupNotes,
        customSingleNotes: draft.customSingleNotes,
      });
      setIsMounted(true);
    }, 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!isMounted) return;
    saveSessionDraft({
      schemaVersion: SESSION_DRAFT_SCHEMA_VERSION,
      hits: hits.hits,
      speedRecords: [],
      speedColumns: skills.speedColumns,
      speedMarks: skills.speedMarks,
      assignments: assignments.assignments,
      testItems: assignments.testItems,
      assignmentLocked: assignments.assignmentLocked,
      committedAssignments: assignments.committedAssignments,
      assignmentLog: assignments.assignmentLog,
      flyCatchAttempts: skills.flyCatchAttempts,
      strikeJudgeColumns: skills.strikeJudgeColumns,
      strikeJudgeCells: skills.strikeJudgeCells,
      throwPlays: skills.throwPlays,
      customTestDefs: assignments.customSlice.customTestDefs,
      customPlayerNotes: assignments.customSlice.customPlayerNotes,
      customGroupNotes: assignments.customSlice.customGroupNotes,
      customSingleNotes: assignments.customSlice.customSingleNotes,
    });
  }, [
    hits.hits,
    skills.speedColumns,
    skills.speedMarks,
    assignments.assignments,
    assignments.testItems,
    assignments.assignmentLocked,
    assignments.committedAssignments,
    assignments.assignmentLog,
    assignments.customSlice,
    skills.flyCatchAttempts,
    skills.strikeJudgeColumns,
    skills.strikeJudgeCells,
    skills.throwPlays,
    isMounted,
  ]);

  const currentBatter = players.find((player) => player.id === currentBatterId);

  const handleToggleTab = (tab: string) => {
    setActiveTab((prev) => (prev === tab ? null : tab));
  };

  const handleBeginEditHit = (hitId: string) => {
    const playerId = hits.handleBeginEditHit(hitId);
    if (playerId) setCurrentBatterId(playerId);
  };

  const handleRemoveCustomTest = (testItem: string) => {
    const removed = assignments.handleRemoveCustomTest(testItem);
    if (removed && activeTab === testItem) setActiveTab(null);
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

    const res = await createRosterPlayer(name.trim(), gender);
    if (!res.success) {
      console.error("云端被拒:", res.error);
      window.alert(`创建队员失败：${res.error}`);
      return;
    }
    setPlayers((prev) => [...prev, res.player]);
    setCurrentBatterId(res.player.id);
  };

  const clearBoardAfterArchive = () => {
    hits.resetHits();
    skills.resetSkillRecords();
    assignments.resetAssignments();
    setActiveTab("T座打击");
    clearSessionDraft();
  };

  const pitcherPlayers = playersAssignedTo(
    "投手",
    players,
    assignments.assignments
  );

  return {
    ADD_CUSTOM_TEST_PANEL_ID,
    players,
    setPlayers,
    hits: hits.hits,
    speedColumns: skills.speedColumns,
    speedMarks: skills.speedMarks,
    flyCatchAttempts: skills.flyCatchAttempts,
    flyCatchNoteDrafts: skills.flyCatchNoteDrafts,
    strikeJudgeColumns: skills.strikeJudgeColumns,
    strikeJudgeCells: skills.strikeJudgeCells,
    throwPlays: skills.throwPlays,
    assignmentLocked: assignments.assignmentLocked,
    assignmentLog: assignments.assignmentLog,
    committedAssignments: assignments.committedAssignments,
    assignments: assignments.assignments,
    testItems: assignments.testItems,
    customTestName: assignments.customTestName,
    setCustomTestName: assignments.setCustomTestName,
    customTestMode: assignments.customTestMode,
    setCustomTestMode: assignments.setCustomTestMode,
    customSlice: assignments.customSlice,
    customTestDefs: assignments.customSlice.customTestDefs,
    customPlayerNotes: assignments.customSlice.customPlayerNotes,
    customGroupNotes: assignments.customSlice.customGroupNotes,
    customSingleNotes: assignments.customSlice.customSingleNotes,
    currentBatterId,
    setCurrentBatterId,
    clearBoardAfterArchive,
    currentResult: hits.currentResult,
    currentPitchType: hits.currentPitchType,
    setCurrentPitchType: hits.setCurrentPitchType,
    currentHitQuality: hits.currentHitQuality,
    setCurrentHitQuality: hits.setCurrentHitQuality,
    pendingHit: hits.pendingHit,
    editingHitId: hits.editingHitId,
    editingFlyCatchId: skills.editingFlyCatchId,
    activeTab,
    sidebarMode: assignments.sidebarMode,
    setSidebarMode: assignments.setSidebarMode,
    batterHits: hits.batterHits,
    plottableHits: hits.plottableHits,
    isEntryPanelActive: hits.isEntryPanelActive,
    showPitchQualityPanel: hits.showPitchQualityPanel,
    visibleTestItems: accordionTestItems(assignments.testItems),
    speedTestAssignedPlayers: playersAssignedTo(
      "上垒速度",
      players,
      assignments.assignments
    ),
    flyCatchAssignedPlayers: playersAssignedTo(
      "接高飞",
      players,
      assignments.assignments
    ),
    strikeJudgePlayers: playersAssignedTo(
      "好球判断",
      players,
      assignments.assignments
    ),
    pitcherPlayers,
    firstBasePlayers: playersAssignedTo(
      "一垒",
      players,
      assignments.assignments
    ),
    throw63Players: playersAssignedTo(
      "6-3传球",
      players,
      assignments.assignments
    ),
    throw43Players: playersAssignedTo(
      "4-3传球",
      players,
      assignments.assignments
    ),
    handleFieldClick: hits.handleFieldClick,
    handleConfirmHit: () => hits.handleConfirmHit(currentBatter),
    handleSelectResult: hits.handleSelectResult,
    handleCancelHit: hits.handleCancelHit,
    handleToggleTab,
    handleToggleAssignment: assignments.handleToggleAssignment,
    handleSelectAllTestsForPlayer: assignments.handleSelectAllTestsForPlayer,
    handleSelectAllPlayersForTest: (testItem: string) =>
      assignments.handleSelectAllPlayersForTest(testItem, players),
    handleSaveAssignments: (author: string, note: string) =>
      assignments.handleSaveAssignments(author, note, players),
    handleBeginEditAssignments: assignments.handleBeginEditAssignments,
    handleSpeedMarkChange: skills.handleSpeedMarkChange,
    handleAddSpeedColumn: skills.handleAddSpeedColumn,
    handleRemoveSpeedColumn: skills.handleRemoveSpeedColumn,
    handleFlyCatchNoteDraftChange: skills.handleFlyCatchNoteDraftChange,
    handleRecordFlyCatch: skills.handleRecordFlyCatch,
    handleBeginEditFlyCatch: skills.handleBeginEditFlyCatch,
    handleDeleteFlyCatch: skills.handleDeleteFlyCatch,
    handleUndoFlyCatch: skills.handleUndoFlyCatch,
    handleAddStrikeJudgeColumn: skills.handleAddStrikeJudgeColumn,
    handleInitStrikeJudgeColumns: () =>
      skills.handleInitStrikeJudgeColumns(pitcherPlayers),
    handleReorderStrikeJudgeColumns: skills.handleReorderStrikeJudgeColumns,
    handleUpsertStrikeJudgeCell: skills.handleUpsertStrikeJudgeCell,
    handleClearStrikeJudgeCell: skills.handleClearStrikeJudgeCell,
    handleRemoveStrikeJudgeColumn: skills.handleRemoveStrikeJudgeColumn,
    handleUpsertThrowPlay: skills.handleUpsertThrowPlay,
    handleClearThrowPlay: skills.handleClearThrowPlay,
    handleAddCustomTest: assignments.handleAddCustomTest,
    handleRemoveCustomTest,
    upsertCustomPlayerNote: assignments.upsertPlayerNote,
    createCustomGroup: assignments.createGroup,
    changeCustomGroupNote: assignments.changeGroupNote,
    deleteCustomGroupNote: assignments.removeGroup,
    upsertCustomSingleNote: assignments.upsertSingleNote,
    handleBeginEditHit,
    handleDeleteHit: hits.handleDeleteHit,
    handleUndo: hits.handleUndo,
    handleClearAll: () => hits.handleClearAll(currentBatter),
    handleAddPlayer,
  };
}
