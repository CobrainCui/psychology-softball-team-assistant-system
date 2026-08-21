"use client";

import { useState } from "react";
import type { Player } from "@/lib/players";
import {
  type Assignments,
  DEFAULT_TEST_ITEMS,
  isDefaultTestItem,
} from "@/lib/sessionDraft";
import {
  buildAssignmentCommitSummary,
  cloneAssignments,
  diffAssignments,
  type AssignmentCommit,
} from "@/lib/testDay/assignmentLog";
import {
  createCustomGroupNote,
  deleteCustomGroupNote,
  ensureCustomTestDefs,
  pruneCustomTestSlice,
  updateCustomGroupNote,
  upsertCustomPlayerNote,
  upsertCustomSingleNote,
  type CustomRecordMode,
  type CustomTestSlice,
} from "@/lib/testDay/customTests";
import type { SidebarMode } from "@/hooks/testDaySessionTypes";

export function useTestDayAssignments() {
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>("byPlayer");
  const [assignments, setAssignments] = useState<Assignments>({});
  const [testItems, setTestItems] = useState<string[]>([...DEFAULT_TEST_ITEMS]);
  const [customTestName, setCustomTestName] = useState("");
  const [customTestMode, setCustomTestMode] =
    useState<CustomRecordMode>("per_player");
  const [assignmentLocked, setAssignmentLocked] = useState(false);
  const [committedAssignments, setCommittedAssignments] = useState<Assignments>(
    {}
  );
  const [assignmentLog, setAssignmentLog] = useState<AssignmentCommit[]>([]);
  const [customSlice, setCustomSlice] = useState<CustomTestSlice>({
    customTestDefs: [],
    customPlayerNotes: [],
    customGroupNotes: [],
    customSingleNotes: [],
  });

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

  const handleSelectAllPlayersForTest = (
    testItem: string,
    players: Player[]
  ) => {
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

  const handleAddCustomTest = () => {
    const trimmedName = customTestName.trim();
    if (!trimmedName) return false;
    if (testItems.includes(trimmedName)) {
      window.alert("该测试项目已存在，请勿重复添加。");
      return false;
    }
    setTestItems((prev) => [...prev, trimmedName]);
    setCustomSlice((prev) => ({
      ...prev,
      customTestDefs: ensureCustomTestDefs(
        [...testItems, trimmedName],
        [...prev.customTestDefs, { name: trimmedName, mode: customTestMode }],
        DEFAULT_TEST_ITEMS
      ),
    }));
    setCustomTestName("");
    setCustomTestMode("per_player");
    return true;
  };

  const handleRemoveCustomTest = (testItem: string) => {
    if (isDefaultTestItem(testItem)) return false;
    if (assignmentLocked) return false;
    setTestItems((prev) => prev.filter((item) => item !== testItem));
    setAssignments((prev) => {
      const next: Assignments = {};
      for (const [playerId, items] of Object.entries(prev)) {
        next[playerId] = items.filter((item) => item !== testItem);
      }
      return next;
    });
    setCustomSlice((prev) => pruneCustomTestSlice(prev, testItem));
    return true;
  };

  const upsertPlayerNote = (
    testItem: string,
    playerId: string,
    playerName: string,
    note: string
  ) => {
    setCustomSlice((prev) => ({
      ...prev,
      customPlayerNotes: upsertCustomPlayerNote(prev.customPlayerNotes, {
        testItem,
        playerId,
        playerName,
        note,
      }),
    }));
  };

  const createGroup = (
    testItem: string,
    members: { id: string; name: string }[]
  ): boolean => {
    let error: string | null = null;
    setCustomSlice((prev) => {
      const result = createCustomGroupNote(prev.customGroupNotes, {
        testItem,
        members,
      });
      if (!result.success) {
        error = result.error;
        return prev;
      }
      return { ...prev, customGroupNotes: result.groups };
    });
    if (error) {
      window.alert(error);
      return false;
    }
    return true;
  };

  const changeGroupNote = (groupId: string, note: string) => {
    setCustomSlice((prev) => ({
      ...prev,
      customGroupNotes: updateCustomGroupNote(
        prev.customGroupNotes,
        groupId,
        note
      ),
    }));
  };

  const removeGroup = (groupId: string) => {
    setCustomSlice((prev) => ({
      ...prev,
      customGroupNotes: deleteCustomGroupNote(prev.customGroupNotes, groupId),
    }));
  };

  const upsertSingleNote = (testItem: string, note: string) => {
    setCustomSlice((prev) => ({
      ...prev,
      customSingleNotes: upsertCustomSingleNote(prev.customSingleNotes, {
        testItem,
        note,
      }),
    }));
  };

  // 推导步骤：对比上次提交快照 → 写一条报名/修改记录 → 锁定勾选
  const handleSaveAssignments = (
    author: string,
    note: string,
    players: Player[]
  ): boolean => {
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

  const resetAssignments = () => {
    setAssignments({});
    setAssignmentLocked(false);
    setCommittedAssignments({});
    setAssignmentLog([]);
    setTestItems([...DEFAULT_TEST_ITEMS]);
    setCustomSlice({
      customTestDefs: [],
      customPlayerNotes: [],
      customGroupNotes: [],
      customSingleNotes: [],
    });
  };

  return {
    sidebarMode,
    setSidebarMode,
    assignments,
    setAssignments,
    testItems,
    setTestItems,
    customTestName,
    setCustomTestName,
    customTestMode,
    setCustomTestMode,
    assignmentLocked,
    setAssignmentLocked,
    committedAssignments,
    setCommittedAssignments,
    assignmentLog,
    setAssignmentLog,
    customSlice,
    setCustomSlice,
    handleToggleAssignment,
    handleSelectAllTestsForPlayer,
    handleSelectAllPlayersForTest,
    handleAddCustomTest,
    handleRemoveCustomTest,
    upsertPlayerNote,
    createGroup,
    changeGroupNote,
    removeGroup,
    upsertSingleNote,
    handleSaveAssignments,
    handleBeginEditAssignments,
    resetAssignments,
  };
}
