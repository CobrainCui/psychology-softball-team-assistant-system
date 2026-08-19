// 综合测试日当场草稿：刷新后恢复 hits / 速度 / 技能表 / 排阵 / 测试项，归档后清空。

import { STORAGE_KEYS } from "@/lib/storageKeys";
import { safeParseJSON } from "@/lib/safeParse";
import {
  emptySkillArchiveSlice,
  isFlyCatchAttempt,
  isHitRecord,
  isSpeedRecord,
  isStrikeJudgeCell,
  isStrikeJudgeColumn,
  isThrowPlay,
  type FlyCatchAttempt,
  type HitRecord,
  type SkillArchiveSlice,
  type SpeedRecord,
  type StrikeJudgeCell,
  type StrikeJudgeColumn,
  type ThrowPlay,
} from "@/lib/gameArchive";

export const SESSION_DRAFT_SCHEMA_VERSION = 2;

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

export interface SessionDraft extends SkillArchiveSlice {
  schemaVersion: number;
  hits: HitRecord[];
  speedRecords: SpeedRecord[];
  assignments: Assignments;
  testItems: string[];
}

export function isRoleAssignmentItem(item: string): boolean {
  return (ROLE_ASSIGNMENT_ITEMS as readonly string[]).includes(item);
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
    assignments: {},
    testItems: ensureRoleAssignmentItems(testItems),
    ...emptySkillArchiveSlice(),
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
      const testItems = ensureRoleAssignmentItems(
        Array.isArray(obj.testItems) &&
          obj.testItems.every((item) => typeof item === "string") &&
          obj.testItems.length > 0
          ? (obj.testItems as string[])
          : [...DEFAULT_TEST_ITEMS]
      );

      return {
        schemaVersion: SESSION_DRAFT_SCHEMA_VERSION,
        hits,
        speedRecords,
        assignments: parseAssignments(obj.assignments),
        testItems,
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
    assignments: draft.assignments,
    testItems: draft.testItems,
    flyCatchAttempts: draft.flyCatchAttempts,
    strikeJudgeColumns: draft.strikeJudgeColumns,
    strikeJudgeCells: draft.strikeJudgeCells,
    throwPlays: draft.throwPlays,
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
