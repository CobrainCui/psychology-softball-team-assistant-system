// 每日综合状态评估时序：按 playerId+date upsert。五维 1–5，高分更好。

import { STORAGE_KEYS } from "@/lib/storageKeys";
import { safeParseJSON } from "@/lib/safeParse";
import {
  readScopedItem,
  writeScopedItem,
  type DraftScope,
} from "@/lib/scopedStorage";
import type { Scale5 } from "@/lib/clinical/preDimensions";
import { clampScale5 } from "@/lib/clinical/preDimensions";
import type { PreQuadrant } from "@/lib/clinical/preQuadrant";

export { getTodayDateStr } from "@/lib/dateOnly";

export type ReadinessHistoryEntry = {
  playerId: string;
  date: string;
  sleep: Scale5;
  stress: Scale5;
  fatigue: Scale5;
  soreness: Scale5;
  willingness: Scale5;
  physicalBattery: number;
  mentalDrive: number;
  quadrant: PreQuadrant;
};

const QUADRANTS = new Set<PreQuadrant>([
  "slack",
  "real_fatigue",
  "injury_risk",
  "peak",
]);

function isReadinessHistoryEntry(
  value: unknown
): value is ReadinessHistoryEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.playerId === "string" &&
    typeof entry.date === "string" &&
    clampScale5(entry.sleep) != null &&
    clampScale5(entry.stress) != null &&
    clampScale5(entry.fatigue) != null &&
    clampScale5(entry.soreness) != null &&
    clampScale5(entry.willingness) != null &&
    typeof entry.physicalBattery === "number" &&
    typeof entry.mentalDrive === "number" &&
    typeof entry.quadrant === "string" &&
    QUADRANTS.has(entry.quadrant as PreQuadrant)
  );
}

export function loadReadinessHistory(
  scope: DraftScope | null
): ReadinessHistoryEntry[] {
  const raw = readScopedItem(STORAGE_KEYS.readinessHistory, scope);
  const parsed = safeParseJSON<unknown>(raw, []);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(isReadinessHistoryEntry);
}

export function saveReadinessHistory(
  scope: DraftScope | null,
  entries: ReadinessHistoryEntry[]
): void {
  writeScopedItem(
    STORAGE_KEYS.readinessHistory,
    scope,
    JSON.stringify(entries)
  );
}

export function upsertReadinessEntry(
  scope: DraftScope | null,
  entry: ReadinessHistoryEntry
): ReadinessHistoryEntry[] {
  const existing = loadReadinessHistory(scope);
  const withoutSameDay = existing.filter(
    (item) => !(item.playerId === entry.playerId && item.date === entry.date)
  );
  const updated = [...withoutSameDay, entry];
  saveReadinessHistory(scope, updated);
  return updated;
}

export function removeReadinessEntry(
  scope: DraftScope | null,
  playerId: string,
  date: string
): ReadinessHistoryEntry[] {
  const updated = loadReadinessHistory(scope).filter(
    (item) => !(item.playerId === playerId && item.date === date)
  );
  saveReadinessHistory(scope, updated);
  return updated;
}

export function loadPlayerReadinessHistory(
  scope: DraftScope | null,
  playerId: string
): ReadinessHistoryEntry[] {
  return loadReadinessHistory(scope)
    .filter((entry) => entry.playerId === playerId)
    .sort((a, b) => b.date.localeCompare(a.date));
}
