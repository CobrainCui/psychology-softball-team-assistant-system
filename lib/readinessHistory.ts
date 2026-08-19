// 每日综合状态评估时序：按 playerId+date upsert。五维 1–5，高分更好。

import { STORAGE_KEYS } from "@/lib/storageKeys";
import { safeParseJSON } from "@/lib/safeParse";
import type { Scale5 } from "@/lib/clinical/preDimensions";
import { clampScale5 } from "@/lib/clinical/preDimensions";
import type { PreQuadrant } from "@/lib/clinical/preQuadrant";

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

export function getTodayDateStr(today: Date = new Date()): string {
  return today.toISOString().slice(0, 10);
}

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

export function loadReadinessHistory(): ReadinessHistoryEntry[] {
  const raw = localStorage.getItem(STORAGE_KEYS.readinessHistory);
  const parsed = safeParseJSON<unknown>(raw, []);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(isReadinessHistoryEntry);
}

export function saveReadinessHistory(entries: ReadinessHistoryEntry[]): void {
  localStorage.setItem(STORAGE_KEYS.readinessHistory, JSON.stringify(entries));
}

export function upsertReadinessEntry(
  entry: ReadinessHistoryEntry
): ReadinessHistoryEntry[] {
  const existing = loadReadinessHistory();
  const withoutSameDay = existing.filter(
    (item) => !(item.playerId === entry.playerId && item.date === entry.date)
  );
  const updated = [...withoutSameDay, entry];
  saveReadinessHistory(updated);
  return updated;
}

export function loadPlayerReadinessHistory(
  playerId: string
): ReadinessHistoryEntry[] {
  return loadReadinessHistory()
    .filter((entry) => entry.playerId === playerId)
    .sort((a, b) => b.date.localeCompare(a.date));
}
