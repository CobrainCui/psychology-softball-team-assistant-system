"use client";

import { useCallback, useEffect, useState } from "react";
import { type Player } from "@/lib/players";
import { createRosterPlayer, getPlayers } from "@/lib/actions";
import { playersAssignedTo } from "@/lib/testDay/rosterHelpers";
import { accordionTestItems } from "@/lib/sessionDraft";
import { ADD_CUSTOM_TEST_PANEL_ID } from "@/components/test-day/hitLabels";
import { useTestDayHits } from "@/hooks/useTestDayHits";
import { useTestDayAssignments } from "@/hooks/useTestDayAssignments";
import { useTestDaySkillRecords } from "@/hooks/useTestDaySkillRecords";
import { useSession } from "@/lib/useSession";
import { getTestDayDraft, updateTestDayDraftStructure } from "@/lib/testDay/draftActions";
import type { TestDayDraftDto } from "@/lib/testDay/collab/dto";
import { reportActionFail } from "@/hooks/cloudTestDaySubmit";
import { createCloudScoreHandlers } from "@/hooks/cloudTestDayScoreHandlers";
import {
  createCloudStructureHandlers,
  type StructurePatch,
} from "@/hooks/cloudTestDayStructureHandlers";

const POLL_MS = 5000;

export function useCloudTestDaySession(draftId: string) {
  const { user } = useSession();
  const [players, setPlayers] = useState<Player[]>([]);
  const [currentBatterId, setCurrentBatterId] = useState("");
  const [activeTab, setActiveTab] = useState<string | null>("T座打击");
  const [dto, setDto] = useState<TestDayDraftDto | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editingStructure, setEditingStructure] = useState(false);

  const effectiveBatterId =
    currentBatterId && players.some((player) => player.id === currentBatterId)
      ? currentBatterId
      : (players[0]?.id ?? "");

  const hits = useTestDayHits(effectiveBatterId);
  const assignments = useTestDayAssignments();
  const skills = useTestDaySkillRecords();
  const { setHits } = hits;
  const {
    setSpeedMarks,
    setFlyCatchAttempts,
    setStrikeJudgeCells,
    setThrowPlays,
    setSpeedColumns,
    setStrikeJudgeColumns,
  } = skills;
  const {
    setAssignments,
    setTestItems,
    setAssignmentLog,
    setCommittedAssignments,
    setCustomSlice,
    setAssignmentLocked,
  } = assignments;

  const applySnapshot = useCallback(
    (next: TestDayDraftDto, preserveStructure: boolean) => {
      const snap = next.snapshot;
      setHits(snap.hits);
      setSpeedMarks(snap.speedMarks);
      setFlyCatchAttempts(snap.flyCatchAttempts);
      setStrikeJudgeCells(snap.strikeJudgeCells);
      setThrowPlays(snap.throwPlays);
      if (!preserveStructure) {
        setSpeedColumns(snap.speedColumns);
        setStrikeJudgeColumns(snap.strikeJudgeColumns);
        setAssignments(snap.assignments);
        setTestItems(snap.testItems);
        setAssignmentLog(snap.assignmentLog);
        setCommittedAssignments(snap.assignments);
        setCustomSlice({
          customTestDefs: snap.customTestDefs,
          customPlayerNotes: snap.customPlayerNotes,
          customGroupNotes: snap.customGroupNotes,
          customSingleNotes: snap.customSingleNotes,
        });
        setAssignmentLocked(
          next.status !== "open" || !next.canMutateStructure
        );
      } else {
        setCustomSlice((prev) => ({
          ...prev,
          customPlayerNotes: snap.customPlayerNotes,
          customGroupNotes: snap.customGroupNotes,
          customSingleNotes: snap.customSingleNotes,
        }));
      }
    },
    [
      setAssignmentLog,
      setAssignmentLocked,
      setAssignments,
      setCommittedAssignments,
      setCustomSlice,
      setFlyCatchAttempts,
      setHits,
      setSpeedColumns,
      setSpeedMarks,
      setStrikeJudgeCells,
      setStrikeJudgeColumns,
      setTestItems,
      setThrowPlays,
    ]
  );

  const refresh = useCallback(async () => {
    const res = await getTestDayDraft(draftId);
    if (!res.success) {
      console.error("云端被拒:", res.error);
      setLoadError(res.error);
      return false;
    }
    setLoadError(null);
    setDto(res.draft);
    applySnapshot(res.draft, editingStructure);
    return true;
  }, [applySnapshot, draftId, editingStructure]);

  useEffect(() => {
    const kickoff = window.setTimeout(() => {
      void refresh();
    }, 0);
    const poll = window.setInterval(() => {
      void refresh();
    }, POLL_MS);
    return () => {
      window.clearTimeout(kickoff);
      window.clearInterval(poll);
    };
  }, [refresh]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await getPlayers();
      if (cancelled || !res.success) return;
      setPlayers(
        res.players.map((player) => ({
          id: player.id,
          name: player.name,
          gender: player.gender ?? undefined,
          role: player.role,
        }))
      );
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const canSubmit = Boolean(dto?.isMember) && dto?.status !== "archived";
  const canMutateStructure =
    Boolean(dto?.canMutateStructure) && dto?.status === "open";

  const patchStructure = async (patch: StructurePatch) => {
    const res = await updateTestDayDraftStructure(draftId, patch);
    if (!res.success) return reportActionFail(res.error);
    await refresh();
    return true;
  };

  const currentBatter = players.find((player) => player.id === effectiveBatterId);
  const pitcherPlayers = playersAssignedTo(
    "投手",
    players,
    assignments.assignments
  );

  const scores = createCloudScoreHandlers({
    draftId,
    canSubmit,
    refresh,
    hits,
    skills,
    currentBatterId: effectiveBatterId,
    currentBatter,
    setCurrentBatterId,
  });
  const structure = createCloudStructureHandlers({
    draftId,
    canSubmit,
    canMutateStructure,
    refresh,
    patchStructure,
    skills,
    assignments,
    players,
    pitcherPlayers,
    activeTab,
    setActiveTab,
    setEditingStructure,
  });

  const handleToggleTab = (tab: string) => {
    setActiveTab((prev) => (prev === tab ? null : tab));
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

  return {
    ADD_CUSTOM_TEST_PANEL_ID,
    source: "cloud" as const,
    dto,
    loadError,
    refresh,
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
    currentBatterId: effectiveBatterId,
    setCurrentBatterId,
    clearBoardAfterArchive: () => undefined,
    persistDraft: () => undefined,
    peerWriting: false,
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
    handleConfirmHit: scores.handleConfirmHit,
    handleSelectResult: hits.handleSelectResult,
    handleCancelHit: hits.handleCancelHit,
    handleToggleTab,
    handleToggleAssignment: assignments.handleToggleAssignment,
    handleSelectAllTestsForPlayer: assignments.handleSelectAllTestsForPlayer,
    handleSelectAllPlayersForTest: (testItem: string) =>
      assignments.handleSelectAllPlayersForTest(testItem, players),
    handleSaveAssignments: structure.handleSaveAssignments,
    handleBeginEditAssignments: structure.handleBeginEditAssignments,
    handleSpeedMarkChange: scores.handleSpeedMarkChange,
    handleAddSpeedColumn: structure.handleAddSpeedColumn,
    handleRemoveSpeedColumn: structure.handleRemoveSpeedColumn,
    handleFlyCatchNoteDraftChange: skills.handleFlyCatchNoteDraftChange,
    handleRecordFlyCatch: scores.handleRecordFlyCatch,
    handleBeginEditFlyCatch: skills.handleBeginEditFlyCatch,
    handleDeleteFlyCatch: scores.handleDeleteFlyCatch,
    handleUndoFlyCatch: scores.handleUndoFlyCatch,
    handleAddStrikeJudgeColumn: structure.handleAddStrikeJudgeColumn,
    handleInitStrikeJudgeColumns: structure.handleInitStrikeJudgeColumns,
    handleReorderStrikeJudgeColumns: structure.handleReorderStrikeJudgeColumns,
    handleUpsertStrikeJudgeCell: scores.handleUpsertStrikeJudgeCell,
    handleClearStrikeJudgeCell: scores.handleClearStrikeJudgeCell,
    handleRemoveStrikeJudgeColumn: structure.handleRemoveStrikeJudgeColumn,
    handleUpsertThrowPlay: scores.handleUpsertThrowPlay,
    handleClearThrowPlay: scores.handleClearThrowPlay,
    handleAddCustomTest: structure.handleAddCustomTest,
    handleRemoveCustomTest: structure.handleRemoveCustomTest,
    upsertCustomPlayerNote: structure.upsertCustomPlayerNote,
    createCustomGroup: structure.createCustomGroup,
    changeCustomGroupNote: structure.changeCustomGroupNote,
    deleteCustomGroupNote: structure.deleteCustomGroupNote,
    upsertCustomSingleNote: structure.upsertCustomSingleNote,
    handleBeginEditHit: scores.handleBeginEditHit,
    handleDeleteHit: scores.handleDeleteHit,
    handleUndo: scores.handleUndo,
    handleClearAll: scores.handleClearAll,
    handleAddPlayer,
  };
}
