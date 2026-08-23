import type { Player } from "@/lib/players";
import type { Assignments } from "@/lib/sessionDraft";
import { DEFAULT_TEST_ITEMS, isDefaultTestItem } from "@/lib/sessionDraft";
import type { AssignmentCommit } from "@/lib/testDay/assignmentLog";
import {
  buildAssignmentCommitSummary,
  diffAssignments,
} from "@/lib/testDay/assignmentLog";
import {
  defsOnlyCustomTests,
  ensureCustomTestDefs,
  groupNoteClientEntryId,
  pruneCustomTestSlice,
} from "@/lib/testDay/customTests";
import { isDefaultSpeedColumnId } from "@/lib/testDay/speedGrid";
import type { useTestDayAssignments } from "@/hooks/useTestDayAssignments";
import type { useTestDaySkillRecords } from "@/hooks/useTestDaySkillRecords";
import {
  submitCloudEntry,
  tombstoneCloudEntry,
} from "@/hooks/cloudTestDaySubmit";
import type { DraftScope } from "@/lib/scopedStorage";

type AssignmentsApi = ReturnType<typeof useTestDayAssignments>;
type Skills = ReturnType<typeof useTestDaySkillRecords>;

export type StructurePatch = {
  testItems?: string[];
  assignments?: Assignments;
  assignmentLog?: AssignmentCommit[];
  customTests?: unknown;
  skillStructure?: unknown;
  expectedVersion?: number;
};

export function createCloudStructureHandlers(input: {
  draftId: string;
  canSubmit: boolean;
  canMutateStructure: boolean;
  refresh: () => Promise<boolean>;
  patchStructure: (patch: StructurePatch) => Promise<boolean>;
  skills: Skills;
  assignments: AssignmentsApi;
  players: Player[];
  pitcherPlayers: Player[];
  activeTab: string | null;
  setActiveTab: (tab: string | null) => void;
  setEditingStructure: (editing: boolean) => void;
  onNotice: (message: string) => void;
  scope: DraftScope | null;
}) {
  const {
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
    onNotice,
    scope,
  } = input;
  const submit = (kind: Parameters<typeof submitCloudEntry>[0]["kind"], payload: unknown) =>
    submitCloudEntry({ draftId, kind, payload, onNotice, scope });
  const tombstone = (clientEntryId: string) =>
    tombstoneCloudEntry({ draftId, clientEntryId, onNotice, scope });

  const handleAddSpeedColumn = (name: string): boolean => {
    if (!canMutateStructure) return false;
    const trimmed = name.trim();
    if (!trimmed) {
      onNotice("请输入测试项目名称。");
      return false;
    }
    if (skills.speedColumns.some((column) => column.name === trimmed)) {
      onNotice("该测试项目已存在，请勿重复添加。");
      return false;
    }
    const next = [
      ...skills.speedColumns,
      {
        id: crypto.randomUUID(),
        name: trimmed,
        sortOrder: skills.speedColumns.length,
      },
    ];
    void patchStructure({
      skillStructure: {
        speedColumns: next,
        strikeJudgeColumns: skills.strikeJudgeColumns,
      },
    });
    return true;
  };

  const handleRemoveSpeedColumn = (columnId: string) => {
    if (!canMutateStructure || isDefaultSpeedColumnId(columnId)) return;
    const next = skills.speedColumns
      .filter((column) => column.id !== columnId)
      .map((column, index) => ({ ...column, sortOrder: index }));
    void patchStructure({
      skillStructure: {
        speedColumns: next,
        strikeJudgeColumns: skills.strikeJudgeColumns,
      },
    });
  };

  const patchStrikeColumns = (nextColumns: Skills["strikeJudgeColumns"]) => {
    void patchStructure({
      skillStructure: {
        speedColumns: skills.speedColumns,
        strikeJudgeColumns: nextColumns,
      },
    });
  };

  const handleAddStrikeJudgeColumn = (
    pitcherId: string,
    pitcherName: string
  ) => {
    if (!canMutateStructure) return;
    patchStrikeColumns([
      ...skills.strikeJudgeColumns,
      {
        id: crypto.randomUUID(),
        pitcherId,
        pitcherName,
        sortOrder: skills.strikeJudgeColumns.length,
      },
    ]);
  };

  const handleInitStrikeJudgeColumns = () => {
    if (!canMutateStructure) return;
    patchStrikeColumns(
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
    if (!canMutateStructure) return;
    const sorted = [...skills.strikeJudgeColumns].sort(
      (a, b) => a.sortOrder - b.sortOrder
    );
    if (
      fromIndex < 0 ||
      toIndex < 0 ||
      fromIndex >= sorted.length ||
      toIndex >= sorted.length
    ) {
      return;
    }
    const [moved] = sorted.splice(fromIndex, 1);
    sorted.splice(toIndex, 0, moved);
    patchStrikeColumns(
      sorted.map((column, index) => ({ ...column, sortOrder: index }))
    );
  };

  const handleRemoveStrikeJudgeColumn = (columnId: string) => {
    if (!canMutateStructure) return;
    patchStrikeColumns(
      skills.strikeJudgeColumns
        .filter((column) => column.id !== columnId)
        .map((column, index) => ({ ...column, sortOrder: index }))
    );
  };

  const handleSaveAssignments = (author: string, note: string): boolean => {
    if (!canMutateStructure) return false;
    const trimmedAuthor = author.trim();
    if (!trimmedAuthor) {
      onNotice("请填写修改人。");
      return false;
    }
    const { added, removed } = diffAssignments(
      assignments.committedAssignments,
      assignments.assignments
    );
    const isRevision = assignments.assignmentLog.length > 0;
    if (!isRevision && added.length === 0) {
      onNotice("请先勾选测试报名后再保存。");
      return false;
    }
    if (isRevision && added.length === 0 && removed.length === 0) {
      onNotice("排阵未改动，无需保存。");
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
    const nextLog = [
      ...assignments.assignmentLog,
      {
        id: crypto.randomUUID(),
        author: trimmedAuthor,
        note: trimmedNote || undefined,
        summary,
        added,
        removed,
        timestamp: Date.now(),
      },
    ];
    setEditingStructure(false);
    void patchStructure({
      assignments: assignments.assignments,
      assignmentLog: nextLog,
    });
    return true;
  };

  const handleBeginEditAssignments = () => {
    if (!canMutateStructure) return;
    setEditingStructure(true);
    assignments.handleBeginEditAssignments();
  };

  const handleAddCustomTest = () => {
    if (!canMutateStructure) return false;
    const trimmedName = assignments.customTestName.trim();
    if (!trimmedName) return false;
    if (assignments.testItems.includes(trimmedName)) {
      onNotice("该测试项目已存在，请勿重复添加。");
      return false;
    }
    const nextItems = [...assignments.testItems, trimmedName];
    const nextSlice = {
      ...assignments.customSlice,
      customTestDefs: ensureCustomTestDefs(
        nextItems,
        [
          ...assignments.customSlice.customTestDefs,
          { name: trimmedName, mode: assignments.customTestMode },
        ],
        DEFAULT_TEST_ITEMS
      ),
    };
    assignments.setCustomTestName("");
    void patchStructure({
      testItems: nextItems,
      customTests: defsOnlyCustomTests(nextSlice),
    });
    return true;
  };

  const handleRemoveCustomTest = (testItem: string) => {
    if (isDefaultTestItem(testItem) || !canMutateStructure) return false;
    const nextItems = assignments.testItems.filter((item) => item !== testItem);
    const nextAssignments: Assignments = {};
    for (const [playerId, items] of Object.entries(assignments.assignments)) {
      nextAssignments[playerId] = items.filter((item) => item !== testItem);
    }
    void patchStructure({
      testItems: nextItems,
      assignments: nextAssignments,
      customTests: defsOnlyCustomTests(
        pruneCustomTestSlice(assignments.customSlice, testItem)
      ),
    });
    if (activeTab === testItem) setActiveTab(null);
    return true;
  };

  const upsertCustomPlayerNote = (
    testItem: string,
    playerId: string,
    playerName: string,
    note: string
  ) => {
    if (!canSubmit) return;
    const existing = assignments.customSlice.customPlayerNotes.find(
      (row) => row.testItem === testItem && row.playerId === playerId
    );
    void (async () => {
      if (existing) {
        const ok = await tombstone(existing.id);
        if (!ok) return;
      }
      if (!note.trim()) {
        await refresh();
        return;
      }
      await submit("custom_player_note", {
        id: crypto.randomUUID(),
        testItem,
        playerId,
        playerName,
        note,
        timestamp: Date.now(),
      });
      await refresh();
    })();
  };

  const createCustomGroup = (
    testItem: string,
    members: { id: string; name: string }[]
  ): boolean => {
    if (!canSubmit) return false;
    if (members.length < 2) {
      onNotice("一组至少两名队员。");
      return false;
    }
    void submit("custom_group_note", {
      id: crypto.randomUUID(),
      revisionId: crypto.randomUUID(),
      testItem,
      memberIds: members.map((member) => member.id),
      memberNames: members.map((member) => member.name),
      note: "",
      timestamp: Date.now(),
    }).then((ok) => {
      if (ok) void refresh();
    });
    return true;
  };

  const changeCustomGroupNote = (groupId: string, note: string) => {
    if (!canSubmit) return;
    const existing = assignments.customSlice.customGroupNotes.find(
      (row) => row.id === groupId
    );
    if (!existing) return;
    void (async () => {
      const ok = await tombstone(groupNoteClientEntryId(existing));
      if (!ok) return;
      await submit("custom_group_note", {
        ...existing,
        note,
        timestamp: Date.now(),
        revisionId: crypto.randomUUID(),
      });
      await refresh();
    })();
  };

  const deleteCustomGroupNote = (groupId: string) => {
    if (!canSubmit) return;
    const existing = assignments.customSlice.customGroupNotes.find(
      (row) => row.id === groupId
    );
    void (async () => {
      const ok = await tombstone(
        existing ? groupNoteClientEntryId(existing) : groupId
      );
      if (ok) await refresh();
    })();
  };

  const upsertCustomSingleNote = (testItem: string, note: string) => {
    if (!canSubmit) return;
    const existing = assignments.customSlice.customSingleNotes.find(
      (row) => row.testItem === testItem
    );
    void (async () => {
      if (existing) {
        const ok = await tombstone(existing.id);
        if (!ok) return;
      }
      if (!note.trim()) {
        await refresh();
        return;
      }
      await submit("custom_single_note", {
        id: crypto.randomUUID(),
        testItem,
        note,
        timestamp: Date.now(),
      });
      await refresh();
    })();
  };

  return {
    handleAddSpeedColumn,
    handleRemoveSpeedColumn,
    handleAddStrikeJudgeColumn,
    handleInitStrikeJudgeColumns,
    handleReorderStrikeJudgeColumns,
    handleRemoveStrikeJudgeColumn,
    handleSaveAssignments,
    handleBeginEditAssignments,
    handleAddCustomTest,
    handleRemoveCustomTest,
    upsertCustomPlayerNote,
    createCustomGroup,
    changeCustomGroupNote,
    deleteCustomGroupNote,
    upsertCustomSingleNote,
  };
}
