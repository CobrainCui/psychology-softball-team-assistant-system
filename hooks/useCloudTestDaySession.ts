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
import { draftScopeFromUser } from "@/lib/scopedStorage";
import { getTestDayDraft, updateTestDayDraftStructure } from "@/lib/testDay/draftActions";
import {
  clearTestDayArchiveReady,
  confirmTestDayArchiveReady,
  reportTestDayDeviceOutbox,
} from "@/lib/testDay/deviceActions";
import type { TestDayDraftDto } from "@/lib/testDay/collab/dto";
import { overlayPendingOnSnapshot } from "@/lib/testDay/collab/pendingOverlay";
import { countInflightTestDaySubmits, reportActionFail } from "@/hooks/cloudTestDaySubmit";
import { createCloudScoreHandlers } from "@/hooks/cloudTestDayScoreHandlers";
import {
  createCloudStructureHandlers,
  type StructurePatch,
} from "@/hooks/cloudTestDayStructureHandlers";
import { useSyncOutbox } from "@/hooks/useSyncOutbox";
import type { NewRosterPlayerInput } from "@/hooks/testDaySessionTypes";
import {
  countFailedTestDayOutbox,
  countPendingTestDayOutbox,
  loadPendingSyncOutbox,
} from "@/lib/syncOutbox";
import { getClientDeviceId } from "@/lib/testDay/clientDevice";
import {
  canConfirmArchiveReady,
} from "@/lib/testDay/collab/archiveReady";

const POLL_MS = 5000;

const structurePatchChains = new Map<string, Promise<boolean>>();
const structureVersions = new Map<string, number>();

function enqueueStructurePatch(
  draftId: string,
  run: () => Promise<boolean>
): Promise<boolean> {
  const prev = structurePatchChains.get(draftId) ?? Promise.resolve(true);
  const next = prev.then(run, run);
  structurePatchChains.set(
    draftId,
    next.then(
      () => true,
      () => true
    )
  );
  return next;
}

export function useCloudTestDaySession(draftId: string) {
  const { user } = useSession();
  const scope = draftScopeFromUser(user);
  const [players, setPlayers] = useState<Player[]>([]);
  const [currentBatterId, setCurrentBatterId] = useState("");
  const [activeTab, setActiveTab] = useState<string | null>("T座打击");
  const [dto, setDto] = useState<TestDayDraftDto | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncedAt, setSyncedAt] = useState<Date | null>(null);
  const [fieldNotice, setFieldNotice] = useState<string | null>(null);
  const [rosterError, setRosterError] = useState<string | null>(null);
  const [rosterReady, setRosterReady] = useState(false);
  const [editingStructure, setEditingStructure] = useState(false);
  // 推导步骤：已有盘面后同步失败只记 syncError，不把已加载 DTO 锁死
  const [hasBoard, setHasBoard] = useState(false);
  const [sourceDto, setSourceDto] = useState<TestDayDraftDto | null>(null);
  const [pendingEntryIds, setPendingEntryIds] = useState<string[]>([]);
  const [draftPendingCount, setDraftPendingCount] = useState(0);
  const [draftFailedCount, setDraftFailedCount] = useState(0);
  const [localSubmitLocked, setLocalSubmitLocked] = useState(false);

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

  const paintFromCloud = useCallback(
    (next: TestDayDraftDto, preserveStructure: boolean) => {
      setSourceDto(next);
      const { snapshot, pendingIds } = overlayPendingOnSnapshot(
        next.snapshot,
        loadPendingSyncOutbox(scope),
        draftId
      );
      const painted = { ...next, snapshot };
      setDto(painted);
      setPendingEntryIds(pendingIds);
      setDraftPendingCount(countPendingTestDayOutbox(scope, draftId));
      setDraftFailedCount(countFailedTestDayOutbox(scope, draftId));
      setLocalSubmitLocked(next.selfDeviceReady);
      applySnapshot(painted, preserveStructure);
    },
    [applySnapshot, draftId, scope]
  );

  const reapplyOverlay = useCallback(() => {
    setDraftPendingCount(countPendingTestDayOutbox(scope, draftId));
    setDraftFailedCount(countFailedTestDayOutbox(scope, draftId));
    if (!sourceDto) return;
    paintFromCloud(sourceDto, editingStructure);
  }, [draftId, editingStructure, paintFromCloud, scope, sourceDto]);

  const refresh = useCallback(async () => {
    const res = await getTestDayDraft(draftId, getClientDeviceId(scope) ?? undefined);
    if (!res.success) {
      console.error("云端被拒:", res.error);
      if (hasBoard) {
        setSyncError(res.error);
        reapplyOverlay();
      } else setLoadError(res.error);
      return false;
    }
    setLoadError(null);
    setSyncError(null);
    setHasBoard(true);
    setSyncedAt(new Date());
    structureVersions.set(draftId, res.draft.version);
    paintFromCloud(res.draft, editingStructure);
    return true;
  }, [draftId, editingStructure, hasBoard, paintFromCloud, reapplyOverlay, scope]);

  const { pendingCount, failedItems, dismissFailed } = useSyncOutbox(
    scope,
    (result) => {
      reapplyOverlay();
      if (result.testDaySynced > 0) void refresh();
    }
  );

  const reloadRoster = useCallback(async () => {
    const res = await getPlayers();
    if (!res.success) {
      console.error("云端被拒:", res.error);
      setRosterError(res.error);
      setRosterReady(true);
      return false;
    }
    setRosterError(null);
    setPlayers(
      res.players.map((player) => ({
        id: player.id,
        name: player.name,
        gender: player.gender ?? undefined,
        role: player.role,
      }))
    );
    setRosterReady(true);
    return true;
  }, []);

  useEffect(() => {
    const kickoff = window.setTimeout(() => {
      void refresh();
    }, 0);
    const poll = window.setInterval(() => {
      // 推导步骤：场边切后台时停轮询，回到前台立刻补一次，避免弱网空转
      if (document.hidden) return;
      void refresh();
    }, POLL_MS);
    const onVisible = () => {
      if (!document.hidden) void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearTimeout(kickoff);
      window.clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void reloadRoster();
    }, 0);
    return () => {
      window.clearTimeout(timer);
    };
  }, [reloadRoster]);

  const applyDeviceGates = useCallback(
    (
      deviceGates: TestDayDraftDto["deviceGates"],
      allDevicesArchiveReady: boolean,
      selfDeviceReady: boolean
    ) => {
      setLocalSubmitLocked(selfDeviceReady);
      setSourceDto((prev) =>
        prev
          ? { ...prev, deviceGates, allDevicesArchiveReady, selfDeviceReady }
          : prev
      );
      setDto((prev) =>
        prev
          ? { ...prev, deviceGates, allDevicesArchiveReady, selfDeviceReady }
          : prev
      );
    },
    []
  );

  const confirmArchiveReady = useCallback(async () => {
    const pendingCount = countPendingTestDayOutbox(scope, draftId);
    const failedCount = countFailedTestDayOutbox(scope, draftId);
    const check = canConfirmArchiveReady({
      pendingCount,
      failedCount,
      inflightCount: countInflightTestDaySubmits(draftId),
      openConflictCount: sourceDto?.openConflictCount ?? dto?.openConflictCount ?? 0,
    });
    if (!check.ok) {
      setFieldNotice(check.error);
      return false;
    }
    const deviceId = getClientDeviceId(scope);
    if (!deviceId) {
      setFieldNotice("缺少本机设备标识");
      return false;
    }
    setLocalSubmitLocked(true);
    const res = await confirmTestDayArchiveReady(draftId, deviceId, {
      pendingCount,
      failedCount,
    });
    if (!res.success) {
      console.error("云端被拒:", res.error);
      setLocalSubmitLocked(false);
      setFieldNotice(res.error);
      return false;
    }
    applyDeviceGates(
      res.deviceGates,
      res.allDevicesArchiveReady,
      res.selfDeviceReady
    );
    return true;
  }, [
    applyDeviceGates,
    draftId,
    dto?.openConflictCount,
    scope,
    sourceDto?.openConflictCount,
  ]);

  const clearArchiveReady = useCallback(async () => {
    const deviceId = getClientDeviceId(scope);
    if (!deviceId) {
      setFieldNotice("缺少本机设备标识");
      return false;
    }
    const res = await clearTestDayArchiveReady(draftId, deviceId);
    if (!res.success) {
      console.error("云端被拒:", res.error);
      setFieldNotice(res.error);
      return false;
    }
    applyDeviceGates(
      res.deviceGates,
      res.allDevicesArchiveReady,
      res.selfDeviceReady
    );
    return true;
  }, [applyDeviceGates, draftId, scope]);

  useEffect(() => {
    if (!dto?.isMember || dto.status === "archived") return;
    const deviceId = getClientDeviceId(scope);
    if (!deviceId) return;
    let cancelled = false;
    void reportTestDayDeviceOutbox(draftId, deviceId, {
      pendingCount: countPendingTestDayOutbox(scope, draftId),
      failedCount: countFailedTestDayOutbox(scope, draftId),
    }).then((res) => {
      if (cancelled) return;
      if (!res.success) {
        console.error("云端被拒:", res.error);
        return;
      }
      applyDeviceGates(
        res.deviceGates,
        res.allDevicesArchiveReady,
        res.selfDeviceReady
      );
    });
    return () => {
      cancelled = true;
    };
  }, [
    applyDeviceGates,
    draftFailedCount,
    draftId,
    draftPendingCount,
    dto?.isMember,
    dto?.status,
    scope,
  ]);

  const canSubmit =
    Boolean(dto?.isMember) &&
    dto?.status !== "archived" &&
    !loadError &&
    !rosterError &&
    rosterReady &&
    !dto?.selfDeviceReady &&
    !localSubmitLocked;
  const canMutateStructure =
    Boolean(dto?.canMutateStructure) && dto?.status === "open";

  const patchStructure = (patch: StructurePatch) =>
    enqueueStructurePatch(draftId, async () => {
      const expected = structureVersions.get(draftId);
      if (typeof expected !== "number") {
        return reportActionFail("请刷新后再改排阵", setFieldNotice);
      }
      const res = await updateTestDayDraftStructure(draftId, {
        ...patch,
        expectedVersion: expected,
      });
      if (!res.success) return reportActionFail(res.error, setFieldNotice);
      structureVersions.set(draftId, res.version);
      await refresh();
      return true;
    });

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
    onNotice: setFieldNotice,
    scope,
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
    onNotice: setFieldNotice,
    scope,
  });

  const handleToggleTab = (tab: string) => {
    setActiveTab((prev) => (prev === tab ? null : tab));
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

  return {
    ADD_CUSTOM_TEST_PANEL_ID,
    source: "cloud" as const,
    dto,
    loadError,
    syncError,
    syncedAt,
    fieldNotice,
    setFieldNotice,
    pendingCount,
    draftPendingCount,
    draftFailedCount,
    pendingEntryIds,
    failedItems,
    dismissFailed,
    confirmArchiveReady,
    clearArchiveReady,
    rosterError,
    rosterReady,
    refresh,
    reloadRoster,
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
