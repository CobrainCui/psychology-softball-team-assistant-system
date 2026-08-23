// 每日综合状态评估时序：按 playerId+date upsert。五维 1–5，高分更好。
// schemaVersion 2 起本机稿携带周期/负荷字段，离线重试须原样回传。

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
import type { CycleConfidence, CyclePhaseCode } from "@/lib/clinical/cyclePhase";
import type { PhysiologicalLoadTag } from "@/lib/clinical/physiologicalLoad";
import type { CycleEnergyLevel, CycleMoodLevel } from "@/lib/cycleTypes";
import {
  asCycleConfidence,
  asCycleEnergy,
  asCycleMood,
  asCyclePhaseCode,
  asLoadTag,
  clampScore0to10,
} from "@/lib/status/shared";

export { getTodayDateStr } from "@/lib/dateOnly";

export const READINESS_DRAFT_SCHEMA_VERSION = 3;

export type ReadinessDraftSyncStatus = "pending" | "failed";

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
  schemaVersion?: number;
  cycleDay?: number | null;
  cyclePhaseCode?: CyclePhaseCode | null;
  cycleConfidence?: CycleConfidence | null;
  physiologicalLoadTag?: PhysiologicalLoadTag | null;
  crampsScore?: number | null;
  cycleEnergy?: CycleEnergyLevel | null;
  cycleMood?: CycleMoodLevel | null;
  cycleIrregularFlag?: boolean;
  syncStatus?: ReadinessDraftSyncStatus;
  failedReason?: string | null;
};

const QUADRANTS = new Set<PreQuadrant>([
  "slack",
  "real_fatigue",
  "injury_risk",
  "peak",
]);

function cycleDayFromUnknown(value: unknown): number | null | undefined {
  if (value === null) return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.round(value);
  }
  return undefined;
}

function extrasFromUnknown(
  entry: Record<string, unknown>
): Partial<ReadinessHistoryEntry> {
  return {
    schemaVersion:
      typeof entry.schemaVersion === "number" && Number.isFinite(entry.schemaVersion)
        ? Math.round(entry.schemaVersion)
        : undefined,
    cycleDay: cycleDayFromUnknown(entry.cycleDay),
    cyclePhaseCode: asCyclePhaseCode(entry.cyclePhaseCode),
    cycleConfidence: asCycleConfidence(entry.cycleConfidence),
    physiologicalLoadTag: asLoadTag(entry.physiologicalLoadTag),
    crampsScore: clampScore0to10(entry.crampsScore),
    cycleEnergy: asCycleEnergy(entry.cycleEnergy),
    cycleMood: asCycleMood(entry.cycleMood),
    cycleIrregularFlag:
      typeof entry.cycleIrregularFlag === "boolean"
        ? entry.cycleIrregularFlag
        : undefined,
    syncStatus: entry.syncStatus === "failed" ? "failed" : "pending",
    failedReason:
      typeof entry.failedReason === "string" ? entry.failedReason : undefined,
  };
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

export function parseReadinessHistoryEntry(
  value: unknown
): ReadinessHistoryEntry | null {
  if (!isReadinessHistoryEntry(value)) return null;
  const raw = value as ReadinessHistoryEntry & Record<string, unknown>;
  return {
    playerId: raw.playerId,
    date: raw.date,
    sleep: clampScale5(raw.sleep) as Scale5,
    stress: clampScale5(raw.stress) as Scale5,
    fatigue: clampScale5(raw.fatigue) as Scale5,
    soreness: clampScale5(raw.soreness) as Scale5,
    willingness: clampScale5(raw.willingness) as Scale5,
    physicalBattery: raw.physicalBattery,
    mentalDrive: raw.mentalDrive,
    quadrant: raw.quadrant,
    ...extrasFromUnknown(raw),
  };
}

export function toReadinessCloudSaveInput(entry: ReadinessHistoryEntry): {
  date: string;
  sleep: Scale5;
  stress: Scale5;
  fatigue: Scale5;
  soreness: Scale5;
  willingness: Scale5;
  physicalBattery: number;
  mentalDrive: number;
  quadrant: PreQuadrant;
  cycleDay: number | null;
  cyclePhaseCode: CyclePhaseCode | null;
  cycleConfidence: CycleConfidence | null;
  physiologicalLoadTag: PhysiologicalLoadTag | null;
  crampsScore: number | null;
  cycleEnergy: CycleEnergyLevel | null;
  cycleMood: CycleMoodLevel | null;
  cycleIrregularFlag: boolean;
} {
  return {
    date: entry.date,
    sleep: entry.sleep,
    stress: entry.stress,
    fatigue: entry.fatigue,
    soreness: entry.soreness,
    willingness: entry.willingness,
    physicalBattery: entry.physicalBattery,
    mentalDrive: entry.mentalDrive,
    quadrant: entry.quadrant,
    cycleDay: entry.cycleDay ?? null,
    cyclePhaseCode: entry.cyclePhaseCode ?? null,
    cycleConfidence: entry.cycleConfidence ?? null,
    physiologicalLoadTag: entry.physiologicalLoadTag ?? null,
    crampsScore: entry.crampsScore ?? null,
    cycleEnergy: entry.cycleEnergy ?? null,
    cycleMood: entry.cycleMood ?? null,
    cycleIrregularFlag: Boolean(entry.cycleIrregularFlag),
  };
}

export function loadReadinessHistory(
  scope: DraftScope | null
): ReadinessHistoryEntry[] {
  const raw = readScopedItem(STORAGE_KEYS.readinessHistory, scope);
  const parsed = safeParseJSON<unknown>(raw, []);
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map(parseReadinessHistoryEntry)
    .filter((entry): entry is ReadinessHistoryEntry => entry != null);
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
  const next: ReadinessHistoryEntry = {
    ...entry,
    schemaVersion: READINESS_DRAFT_SCHEMA_VERSION,
    syncStatus: entry.syncStatus ?? "pending",
    failedReason: entry.syncStatus === "failed" ? entry.failedReason : undefined,
  };
  const updated = [...withoutSameDay, next];
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

export function isReadinessPending(entry: ReadinessHistoryEntry): boolean {
  return entry.syncStatus !== "failed";
}

export function markReadinessFailed(
  scope: DraftScope | null,
  playerId: string,
  date: string,
  reason: string
): ReadinessHistoryEntry[] {
  const existing = loadReadinessHistory(scope);
  const updated = existing.map((item) =>
    item.playerId === playerId && item.date === date
      ? {
          ...item,
          syncStatus: "failed" as const,
          failedReason: reason,
          schemaVersion: READINESS_DRAFT_SCHEMA_VERSION,
        }
      : item
  );
  saveReadinessHistory(scope, updated);
  return updated;
}

export function loadFailedReadinessHistory(
  scope: DraftScope | null
): ReadinessHistoryEntry[] {
  return loadReadinessHistory(scope).filter(
    (entry) => entry.syncStatus === "failed"
  );
}

export function loadPendingReadinessHistory(
  scope: DraftScope | null
): ReadinessHistoryEntry[] {
  return loadReadinessHistory(scope).filter(isReadinessPending);
}
