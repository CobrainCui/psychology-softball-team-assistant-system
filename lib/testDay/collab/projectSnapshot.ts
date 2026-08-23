import {
  isFlyCatchAttempt,
  isHitRecord,
  isSpeedColumn,
  isSpeedMark,
  isStrikeJudgeCell,
  isStrikeJudgeColumn,
  isThrowPlay,
  type FlyCatchAttempt,
  type HitRecord,
  type SpeedColumn,
  type SpeedMark,
  type StrikeJudgeCell,
  type StrikeJudgeColumn,
  type ThrowPlay,
} from "@/lib/gameArchive";
import {
  DEFAULT_TEST_ITEMS,
  ensureRoleAssignmentItems,
  parseAssignmentLog,
  parseAssignments,
  type Assignments,
} from "@/lib/sessionDraft";
import type { AssignmentCommit } from "@/lib/testDay/assignmentLog";
import {
  parseCustomTestSlice,
  type CustomTestSlice,
} from "@/lib/testDay/customTests";
import { createDefaultSpeedColumns } from "@/lib/testDay/speedGrid";
import {
  cellValueFingerprint,
  hasOpenConflict,
} from "@/lib/testDay/collab/merge";
import type {
  CollabStoredConflict,
  CollabStoredEntry,
  PublicConflict,
  TestDayEntryKind,
} from "@/lib/testDay/collab/types";

export type SkillStructure = {
  speedColumns: SpeedColumn[];
  strikeJudgeColumns: StrikeJudgeColumn[];
};

export type DraftBoardSnapshot = {
  hits: HitRecord[];
  speedColumns: SpeedColumn[];
  speedMarks: SpeedMark[];
  flyCatchAttempts: FlyCatchAttempt[];
  strikeJudgeColumns: StrikeJudgeColumn[];
  strikeJudgeCells: StrikeJudgeCell[];
  throwPlays: ThrowPlay[];
  assignments: Assignments;
  testItems: string[];
  assignmentLog: AssignmentCommit[];
} & CustomTestSlice;

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function parseSkillStructure(raw: unknown): SkillStructure {
  const obj = asObject(raw);
  const speedColumns = Array.isArray(obj?.speedColumns)
    ? obj.speedColumns.filter(isSpeedColumn)
    : [];
  const strikeJudgeColumns = Array.isArray(obj?.strikeJudgeColumns)
    ? obj.strikeJudgeColumns.filter(isStrikeJudgeColumn)
    : [];
  return {
    speedColumns:
      speedColumns.length > 0 ? speedColumns : createDefaultSpeedColumns(),
    strikeJudgeColumns,
  };
}

function pickCellPayload(
  kind: TestDayEntryKind,
  entityKey: string,
  entries: CollabStoredEntry[],
  conflicts: CollabStoredConflict[]
): unknown | null {
  const resolved = conflicts.find(
    (row) =>
      row.entityKey === entityKey &&
      row.reviewStatus === "resolved" &&
      row.finalPayload != null
  );
  if (resolved) return resolved.finalPayload;
  if (hasOpenConflict(conflicts, entityKey)) return null;

  const active = entries.filter(
    (row) =>
      row.entityKey === entityKey &&
      row.status === "active" &&
      row.kind === kind
  );
  if (active.length === 0) return null;
  const firstPrint = cellValueFingerprint(kind, active[0].payload);
  const allSame = active.every(
    (row) => cellValueFingerprint(kind, row.payload) === firstPrint
  );
  if (!allSame) return null;
  return active[0].payload;
}

export function toPublicConflicts(
  conflicts: CollabStoredConflict[],
  entries: CollabStoredEntry[]
): PublicConflict[] {
  const byId = new Map(entries.map((row) => [row.id, row]));
  return conflicts.map((row) => ({
    id: row.id,
    entityKey: row.entityKey,
    type: row.type,
    reviewStatus: row.reviewStatus,
    candidateEntryIds: row.candidateEntryIds,
    candidates: row.candidateEntryIds.map((id) => {
      const entry = byId.get(id);
      return {
        id,
        authorAccountId: entry?.authorAccountId ?? "",
        payload: entry?.payload ?? null,
      };
    }),
    finalPayload: row.finalPayload,
  }));
}

export function projectDraftSnapshot(input: {
  testItems: unknown;
  assignments: unknown;
  customTests: unknown;
  skillStructure: unknown;
  assignmentLog: unknown;
  entries: CollabStoredEntry[];
  conflicts: CollabStoredConflict[];
}): DraftBoardSnapshot {
  const skill = parseSkillStructure(input.skillStructure);
  const active = input.entries.filter((row) => row.status === "active");

  const hits = active
    .filter((row) => row.kind === "hit")
    .map((row) => row.payload)
    .filter(isHitRecord);

  const flyCatchAttempts = active
    .filter((row) => row.kind === "fly_catch")
    .map((row) => row.payload)
    .filter(isFlyCatchAttempt);

  const speedMarks: SpeedMark[] = [];
  const seenSpeed = new Set<string>();
  for (const row of active.filter((item) => item.kind === "speed_mark")) {
    if (seenSpeed.has(row.entityKey)) continue;
    seenSpeed.add(row.entityKey);
    const payload = pickCellPayload(
      "speed_mark",
      row.entityKey,
      active,
      input.conflicts
    );
    if (payload && isSpeedMark(payload)) speedMarks.push(payload);
  }

  const strikeJudgeCells: StrikeJudgeCell[] = [];
  const seenStrike = new Set<string>();
  for (const row of active.filter((item) => item.kind === "strike_cell")) {
    if (seenStrike.has(row.entityKey)) continue;
    seenStrike.add(row.entityKey);
    const payload = pickCellPayload(
      "strike_cell",
      row.entityKey,
      active,
      input.conflicts
    );
    if (payload && isStrikeJudgeCell(payload)) strikeJudgeCells.push(payload);
  }

  const throwPlays: ThrowPlay[] = [];
  const seenThrow = new Set<string>();
  for (const row of active.filter((item) => item.kind === "throw_play")) {
    if (seenThrow.has(row.entityKey)) continue;
    seenThrow.add(row.entityKey);
    const payload = pickCellPayload(
      "throw_play",
      row.entityKey,
      active,
      input.conflicts
    );
    if (payload && isThrowPlay(payload)) throwPlays.push(payload);
  }

  const customBase = parseCustomTestSlice(input.customTests);
  const customPlayerNotes = [...customBase.customPlayerNotes];
  const customGroupNotes = [...customBase.customGroupNotes];
  const customSingleNotes = [...customBase.customSingleNotes];

  const seenNotes = new Set<string>();
  for (const row of active.filter(
    (item) =>
      item.kind === "custom_player_note" ||
      item.kind === "custom_group_note" ||
      item.kind === "custom_single_note"
  )) {
    if (seenNotes.has(row.entityKey)) continue;
    seenNotes.add(row.entityKey);
    const payload = pickCellPayload(
      row.kind,
      row.entityKey,
      active,
      input.conflicts
    );
    if (!payload || typeof payload !== "object") continue;
    if (row.kind === "custom_player_note") {
      customPlayerNotes.push(payload as CustomTestSlice["customPlayerNotes"][number]);
    } else if (row.kind === "custom_group_note") {
      customGroupNotes.push(payload as CustomTestSlice["customGroupNotes"][number]);
    } else {
      customSingleNotes.push(payload as CustomTestSlice["customSingleNotes"][number]);
    }
  }

  const testItems = ensureRoleAssignmentItems(
    Array.isArray(input.testItems) &&
      input.testItems.every((item) => typeof item === "string") &&
      input.testItems.length > 0
      ? (input.testItems as string[])
      : [...DEFAULT_TEST_ITEMS]
  );

  return {
    hits,
    speedColumns: skill.speedColumns,
    speedMarks,
    flyCatchAttempts,
    strikeJudgeColumns: skill.strikeJudgeColumns,
    strikeJudgeCells,
    throwPlays,
    assignments: parseAssignments(input.assignments),
    testItems,
    assignmentLog: parseAssignmentLog(input.assignmentLog),
    customTestDefs: customBase.customTestDefs,
    customPlayerNotes,
    customGroupNotes,
    customSingleNotes,
  };
}
