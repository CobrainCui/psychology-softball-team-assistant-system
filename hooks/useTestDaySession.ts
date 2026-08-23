"use client";

import { useEffect, useRef, useState } from "react";
import { type Player } from "@/lib/players";
import { createRosterPlayer } from "@/lib/actions";
import { playersAssignedTo } from "@/lib/testDay/rosterHelpers";
import {
  accordionTestItems,
  clearSessionDraft,
  createEmptySessionDraft,
  loadSessionDraft,
  saveSessionDraft,
  SESSION_DRAFT_SCHEMA_VERSION,
  type SessionDraft,
} from "@/lib/sessionDraft";
import { ADD_CUSTOM_TEST_PANEL_ID } from "@/components/test-day/hitLabels";
import { useTestDayHits } from "@/hooks/useTestDayHits";
import { useTestDayAssignments } from "@/hooks/useTestDayAssignments";
import { useTestDaySkillRecords } from "@/hooks/useTestDaySkillRecords";
import type { NewRosterPlayerInput, PendingHit, SidebarMode } from "@/hooks/testDaySessionTypes";
import { useSession } from "@/lib/useSession";
import {
  draftScopeFromUser,
  ownerToken,
  type DraftScope,
} from "@/lib/scopedStorage";
import {
  createSessionDraftTabId,
  notifySessionDraftCleared,
  notifySessionDraftWriting,
  subscribeSessionDraftSync,
} from "@/lib/testDay/draftSync";

export type { PendingHit, SidebarMode };

function scopeToken(scope: DraftScope | null): string | null {
  return scope ? ownerToken(scope) : null;
}

export function useTestDaySession() {
  const { user } = useSession();
  const scope = draftScopeFromUser(user);
  const tabIdRef = useRef(createSessionDraftTabId());
  const [players, setPlayers] = useState<Player[]>([]);
  const [currentBatterId, setCurrentBatterId] = useState("");
  const [isMounted, setIsMounted] = useState(false);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string | null>("T座打击");
  const [peerWriting, setPeerWriting] = useState(false);
  const [fieldNotice, setFieldNotice] = useState<string | null>(null);

  const hits = useTestDayHits(currentBatterId);
  const assignments = useTestDayAssignments(setFieldNotice);
  const skills = useTestDaySkillRecords(setFieldNotice);

  const applyDraft = (draft: SessionDraft) => {
    hits.setHits(draft.hits);
    skills.setSpeedColumns(draft.speedColumns);
    skills.setSpeedMarks(draft.speedMarks);
    assignments.setAssignments(draft.assignments);
    assignments.setTestItems(draft.testItems);
    assignments.setAssignmentLocked(draft.assignmentLocked);
    assignments.setCommittedAssignments(draft.committedAssignments);
    assignments.setAssignmentLog(draft.assignmentLog);
    skills.setFlyCatchAttempts(draft.flyCatchAttempts);
    skills.setFlyCatchNoteDrafts(draft.flyCatchNoteDrafts);
    skills.setStrikeJudgeColumns(draft.strikeJudgeColumns);
    skills.setStrikeJudgeCells(draft.strikeJudgeCells);
    skills.setThrowPlays(draft.throwPlays);
    assignments.setCustomSlice({
      customTestDefs: draft.customTestDefs,
      customPlayerNotes: draft.customPlayerNotes,
      customGroupNotes: draft.customGroupNotes,
      customSingleNotes: draft.customSingleNotes,
    });
    setCurrentBatterId(draft.currentBatterId);
  };

  const buildDraft = (): SessionDraft => ({
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
    currentBatterId,
    flyCatchNoteDrafts: skills.flyCatchNoteDrafts,
    flyCatchAttempts: skills.flyCatchAttempts,
    strikeJudgeColumns: skills.strikeJudgeColumns,
    strikeJudgeCells: skills.strikeJudgeCells,
    throwPlays: skills.throwPlays,
    customTestDefs: assignments.customSlice.customTestDefs,
    customPlayerNotes: assignments.customSlice.customPlayerNotes,
    customGroupNotes: assignments.customSlice.customGroupNotes,
    customSingleNotes: assignments.customSlice.customSingleNotes,
  });

  // 推导步骤：accountId 变化则清空内存并加载该账号分区草稿；未登录不写盘
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const token = scopeToken(scope);
      if (!scope) {
        applyDraft(createEmptySessionDraft());
        setLoadedFor(null);
        setIsMounted(true);
        return;
      }
      applyDraft(loadSessionDraft(scope));
      setLoadedFor(token);
      setIsMounted(true);
    }, 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope?.teamId, scope?.accountId]);

  useEffect(() => {
    if (!isMounted || !scope) return;
    if (loadedFor !== scopeToken(scope)) return;
    if (saveSessionDraft(scope, buildDraft())) {
      notifySessionDraftWriting(scope, tabIdRef.current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- buildDraft / scope 已由盘面字段与 accountId 覆盖
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
    skills.flyCatchNoteDrafts,
    skills.strikeJudgeColumns,
    skills.strikeJudgeCells,
    skills.throwPlays,
    currentBatterId,
    isMounted,
    loadedFor,
    user?.accountId,
    user?.teamId,
  ]);

  useEffect(() => {
    if (!players.length) return;
    if (currentBatterId && players.some((player) => player.id === currentBatterId)) {
      return;
    }
    const nextId = players[0]!.id;
    const timer = window.setTimeout(() => {
      setCurrentBatterId(nextId);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [players, currentBatterId]);

  useEffect(() => {
    if (!scope) return;
    let hintTimer = 0;
    const unsubscribe = subscribeSessionDraftSync(scope, tabIdRef.current, {
      onCleared: () => {
        clearSessionDraft(scope);
        applyDraft(createEmptySessionDraft());
        setActiveTab("T座打击");
      },
      onPeerWriting: () => {
        setPeerWriting(true);
        window.clearTimeout(hintTimer);
        hintTimer = window.setTimeout(() => setPeerWriting(false), 3000);
      },
    });
    return () => {
      window.clearTimeout(hintTimer);
      unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope?.teamId, scope?.accountId]);

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

  const handleAddPlayer = async (input: NewRosterPlayerInput) => {
    const name = input.name.trim();
    if (!name) {
      setFieldNotice("请填写队员姓名。");
      return;
    }
    const res = await createRosterPlayer(name, input.gender);
    if (!res.success) {
      console.error("云端被拒:", res.error);
      setFieldNotice(`创建队员失败：${res.error}`);
      return;
    }
    setPlayers((prev) => [...prev, res.player]);
    setCurrentBatterId(res.player.id);
  };

  const persistDraft = () => {
    if (!scope || loadedFor !== scopeToken(scope)) return;
    saveSessionDraft(scope, buildDraft());
  };

  const clearBoardAfterArchive = () => {
    hits.resetHits();
    skills.resetSkillRecords();
    assignments.resetAssignments();
    setCurrentBatterId("");
    setActiveTab("T座打击");
    clearSessionDraft(scope);
    if (scope) notifySessionDraftCleared(scope);
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
    persistDraft,
    peerWriting,
    fieldNotice,
    setFieldNotice,
    accountId: user?.accountId ?? null,
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
