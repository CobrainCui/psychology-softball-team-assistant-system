// 综合测试日当场草稿：刷新后恢复 hits / 速度 / 技能表 / 排阵 / 测试项，归档后清空。

import { STORAGE_KEYS } from "@/lib/storageKeys";
import { safeParseJSON } from "@/lib/safeParse";
import {
  emptySkillArchiveSlice,
  isFlyCatchAttempt,
  isHitRecord,
  isSpeedColumn,
  isSpeedMark,
  isSpeedRecord,
  isStrikeJudgeCell,
  isStrikeJudgeColumn,
  isThrowPlay,
  type FlyCatchAttempt,
  type HitRecord,
  type SkillArchiveSlice,
  type SpeedColumn,
  type SpeedMark,
  type SpeedRecord,
  type StrikeJudgeCell,
  type StrikeJudgeColumn,
  type ThrowPlay,
} from "@/lib/gameArchive";
import {
  cloneAssignments,
  isAssignmentCommit,
  type AssignmentCommit,
} from "@/lib/testDay/assignmentLog";
import {
  createDefaultSpeedColumns,
  resolveSpeedGrid,
} from "@/lib/testDay/speedGrid";
import {
  emptyCustomTestSlice,
  ensureCustomTestDefs,
  parseCustomTestSlice,
  type CustomTestSlice,
} from "@/lib/testDay/customTests";

export const SESSION_DRAFT_SCHEMA_VERSION = 5;

export const ROLE_ASSIGNMENT_ITEMS = ["投手", "一垒"] as const;

export const DEFAULT_TEST_ITEMS = [
  "T座打击",
  "上垒速度",
  "接高飞",
  "好球判断",
  "6-3传球",
  "4-3传球",
  "投手",
  "一垒",
] as const;

export type RoleAssignmentItem = (typeof ROLE_ASSIGNMENT_ITEMS)[number];

export type Assignments = Record<string, string[]>;

export interface SessionDraft extends SkillArchiveSlice, CustomTestSlice {
  schemaVersion: number;
  hits: HitRecord[];
  speedRecords: SpeedRecord[];
  speedColumns: SpeedColumn[];
  speedMarks: SpeedMark[];
  assignments: Assignments;
  testItems: string[];
  assignmentLocked: boolean;
  committedAssignments: Assignments;
  assignmentLog: AssignmentCommit[];
}

export function isRoleAssignmentItem(item: string): boolean {
  return (ROLE_ASSIGNMENT_ITEMS as readonly string[]).includes(item);
}

export function isDefaultTestItem(item: string): boolean {
  return (DEFAULT_TEST_ITEMS as readonly string[]).includes(item);
}

export function accordionTestItems(testItems: string[]): string[] {
  return testItems.filter((item) => !isRoleAssignmentItem(item));
}

// 推导步骤：旧草稿缺角色项时补上，避免排阵里看不见投手/一垒
export function ensureRoleAssignmentItems(testItems: string[]): string[] {
  const next = [...testItems];
  for (const role of ROLE_ASSIGNMENT_ITEMS) {
    if (!next.includes(role)) next.push(role);
  }
  return next.length > 0 ? next : [...DEFAULT_TEST_ITEMS];
}

export function createEmptySessionDraft(
  testItems: string[] = [...DEFAULT_TEST_ITEMS]
): SessionDraft {
  return {
    schemaVersion: SESSION_DRAFT_SCHEMA_VERSION,
    hits: [],
    speedRecords: [],
    speedColumns: createDefaultSpeedColumns(),
    speedMarks: [],
    assignments: {},
    testItems: ensureRoleAssignmentItems(testItems),
    assignmentLocked: false,
    committedAssignments: {},
    assignmentLog: [],
    ...emptySkillArchiveSlice(),
    ...emptyCustomTestSlice(),
  };
}

function parseAssignments(value: unknown): Assignments {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Assignments;
}

// 推导步骤：优先读新草稿 → 否则把旧 softball_hits 迁入 → 写回新 key 并清除旧 key
export function loadSessionDraft(): SessionDraft {
  const empty = createEmptySessionDraft();
  const draftRaw = localStorage.getItem(STORAGE_KEYS.sessionDraft);

  if (draftRaw) {
    const parsed = safeParseJSON<unknown>(draftRaw, null);
    if (parsed && typeof parsed === "object") {
      const obj = parsed as Record<string, unknown>;
      const hits = Array.isArray(obj.hits)
        ? obj.hits.filter(isHitRecord)
        : [];
      const speedRecords = Array.isArray(obj.speedRecords)
        ? obj.speedRecords.filter(isSpeedRecord)
        : [];
      const grid = resolveSpeedGrid(
        Array.isArray(obj.speedColumns)
          ? obj.speedColumns.filter(isSpeedColumn)
          : [],
        Array.isArray(obj.speedMarks)
          ? obj.speedMarks.filter(isSpeedMark)
          : [],
        speedRecords
      );
      const testItems = ensureRoleAssignmentItems(
        Array.isArray(obj.testItems) &&
          obj.testItems.every((item) => typeof item === "string") &&
          obj.testItems.length > 0
          ? (obj.testItems as string[])
          : [...DEFAULT_TEST_ITEMS]
      );
      const customSlice = parseCustomTestSlice(obj);

      return {
        schemaVersion: SESSION_DRAFT_SCHEMA_VERSION,
        hits,
        speedRecords,
        speedColumns: grid.columns,
        speedMarks: grid.marks,
        assignments: parseAssignments(obj.assignments),
        testItems,
        assignmentLocked: obj.assignmentLocked === true,
        committedAssignments: parseAssignments(obj.committedAssignments),
        assignmentLog: Array.isArray(obj.assignmentLog)
          ? obj.assignmentLog.filter(isAssignmentCommit)
          : [],
        flyCatchAttempts: Array.isArray(obj.flyCatchAttempts)
          ? obj.flyCatchAttempts.filter(isFlyCatchAttempt)
          : [],
        strikeJudgeColumns: Array.isArray(obj.strikeJudgeColumns)
          ? obj.strikeJudgeColumns.filter(isStrikeJudgeColumn)
          : [],
        strikeJudgeCells: Array.isArray(obj.strikeJudgeCells)
          ? obj.strikeJudgeCells.filter(isStrikeJudgeCell)
          : [],
        throwPlays: Array.isArray(obj.throwPlays)
          ? obj.throwPlays.filter(isThrowPlay)
          : [],
        customTestDefs: ensureCustomTestDefs(
          testItems,
          customSlice.customTestDefs,
          DEFAULT_TEST_ITEMS
        ),
        customPlayerNotes: customSlice.customPlayerNotes,
        customGroupNotes: customSlice.customGroupNotes,
        customSingleNotes: customSlice.customSingleNotes,
      };
    }
  }

  // 兼容旧版：仅有 softball_hits 时迁入草稿
  const legacyHitsRaw = localStorage.getItem(STORAGE_KEYS.hitsLegacy);
  if (legacyHitsRaw) {
    const legacyHits = safeParseJSON<unknown>(legacyHitsRaw, []);
    const hits = Array.isArray(legacyHits)
      ? legacyHits.filter(isHitRecord)
      : [];
    const migrated = { ...empty, hits };
    saveSessionDraft(migrated);
    localStorage.removeItem(STORAGE_KEYS.hitsLegacy);
    return migrated;
  }

  return empty;
}

export function saveSessionDraft(draft: SessionDraft): void {
  const payload: SessionDraft = {
    schemaVersion: SESSION_DRAFT_SCHEMA_VERSION,
    hits: draft.hits,
    speedRecords: draft.speedRecords,
    speedColumns: draft.speedColumns,
    speedMarks: draft.speedMarks,
    assignments: draft.assignments,
    testItems: draft.testItems,
    assignmentLocked: draft.assignmentLocked,
    committedAssignments: cloneAssignments(draft.committedAssignments),
    assignmentLog: draft.assignmentLog,
    flyCatchAttempts: draft.flyCatchAttempts,
    strikeJudgeColumns: draft.strikeJudgeColumns,
    strikeJudgeCells: draft.strikeJudgeCells,
    throwPlays: draft.throwPlays,
    customTestDefs: ensureCustomTestDefs(
      draft.testItems,
      draft.customTestDefs,
      DEFAULT_TEST_ITEMS
    ),
    customPlayerNotes: draft.customPlayerNotes,
    customGroupNotes: draft.customGroupNotes,
    customSingleNotes: draft.customSingleNotes,
  };
  localStorage.setItem(STORAGE_KEYS.sessionDraft, JSON.stringify(payload));
  // 写入新草稿后不再保留旧 hits key，避免双源互相覆盖
  localStorage.removeItem(STORAGE_KEYS.hitsLegacy);
}

export function clearSessionDraft(): void {
  localStorage.removeItem(STORAGE_KEYS.sessionDraft);
  localStorage.removeItem(STORAGE_KEYS.hitsLegacy);
}

export type {
  FlyCatchAttempt,
  StrikeJudgeCell,
  StrikeJudgeColumn,
  ThrowPlay,
};
