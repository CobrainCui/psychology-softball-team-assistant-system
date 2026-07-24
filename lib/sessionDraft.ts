// 综合测试日当场草稿：刷新后恢复 hits / 速度 / 排阵 / 测试项，归档后清空。

import { STORAGE_KEYS } from "@/lib/storageKeys";
import { safeParseJSON } from "@/lib/safeParse";
import type { HitRecord, SpeedRecord } from "@/lib/gameArchive";

export const SESSION_DRAFT_SCHEMA_VERSION = 1;

export const DEFAULT_TEST_ITEMS = [
  "T座打击",
  "上垒速度",
  "接高飞",
  "好球判断",
  "6-3传球",
  "4-3传球",
] as const;

export type Assignments = Record<string, string[]>;

export interface SessionDraft {
  schemaVersion: number;
  hits: HitRecord[];
  speedRecords: SpeedRecord[];
  assignments: Assignments;
  testItems: string[];
}

export function createEmptySessionDraft(
  testItems: string[] = [...DEFAULT_TEST_ITEMS]
): SessionDraft {
  return {
    schemaVersion: SESSION_DRAFT_SCHEMA_VERSION,
    hits: [],
    speedRecords: [],
    assignments: {},
    testItems,
  };
}

function isHitRecord(value: unknown): value is HitRecord {
  if (!value || typeof value !== "object") return false;
  const hit = value as Record<string, unknown>;
  return (
    typeof hit.id === "string" &&
    typeof hit.result === "string" &&
    typeof hit.playerId === "string" &&
    typeof hit.playerName === "string" &&
    typeof hit.timestamp === "number"
  );
}

function isSpeedRecord(value: unknown): value is SpeedRecord {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === "string" &&
    typeof row.playerId === "string" &&
    typeof row.playerName === "string" &&
    typeof row.timestamp === "number"
  );
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
      const assignments =
        obj.assignments &&
        typeof obj.assignments === "object" &&
        !Array.isArray(obj.assignments)
          ? (obj.assignments as Assignments)
          : {};
      const testItems =
        Array.isArray(obj.testItems) &&
        obj.testItems.every((item) => typeof item === "string") &&
        obj.testItems.length > 0
          ? (obj.testItems as string[])
          : [...DEFAULT_TEST_ITEMS];

      return {
        schemaVersion:
          typeof obj.schemaVersion === "number"
            ? obj.schemaVersion
            : SESSION_DRAFT_SCHEMA_VERSION,
        hits,
        speedRecords,
        assignments,
        testItems,
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
  };
  localStorage.setItem(STORAGE_KEYS.sessionDraft, JSON.stringify(payload));
  // 写入新草稿后不再保留旧 hits key，避免双源互相覆盖
  localStorage.removeItem(STORAGE_KEYS.hitsLegacy);
}

export function clearSessionDraft(): void {
  localStorage.removeItem(STORAGE_KEYS.sessionDraft);
  localStorage.removeItem(STORAGE_KEYS.hitsLegacy);
}
