// 每日综合状态评估时序：按 playerId+date upsert。

import { STORAGE_KEYS } from "@/lib/storageKeys";
import { safeParseJSON } from "@/lib/safeParse";
import { isPainArea, type PainArea } from "@/lib/clinical/painAreas";

export type ProbeFeedback = "A" | "B" | "C";

export type SleepQuality = "good" | "normal" | "bad";

export interface ReadinessHistoryEntry {
  playerId: string;
  date: string;
  readinessScore: number;
  hasNewInjury: boolean;
  injuryPart: PainArea | null;
  injuryScore: number;
  probeFeedback: ProbeFeedback | null;
  /** Wellness 原值；旧本地草稿可能缺失 */
  sleepQuality?: SleepQuality | null;
  stressScore?: number | null;
  fatigueScore?: number | null;
  sorenessScore?: number | null;
}

/** 软组织恢复常超 3 天；未探针 A 清除前持续追踪 */
export const RECENT_INJURY_LOOKBACK_DAYS = 7;

export function getTodayDateStr(today: Date = new Date()): string {
  return today.toISOString().slice(0, 10);
}

function isReadinessHistoryEntry(value: unknown): value is ReadinessHistoryEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.playerId === "string" &&
    typeof entry.date === "string" &&
    typeof entry.readinessScore === "number"
  );
}

export function loadReadinessHistory(): ReadinessHistoryEntry[] {
  const raw = localStorage.getItem(STORAGE_KEYS.readinessHistory);
  const parsed = safeParseJSON<unknown>(raw, []);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(isReadinessHistoryEntry).map((entry) => ({
    ...entry,
    injuryPart: isPainArea(entry.injuryPart) ? entry.injuryPart : null,
  }));
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

// 最近 N 天内仍带有 injuryPart 的记录 → 今日需复测的部位
export function findRecentInjuryPart(
  history: ReadinessHistoryEntry[],
  lookbackDays: number = RECENT_INJURY_LOOKBACK_DAYS,
  today: Date = new Date()
): PainArea | null {
  if (history.length === 0) return null;

  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() - lookbackDays);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const recentEntry = history.find(
    (entry) => entry.date >= cutoffStr && entry.injuryPart !== null
  );
  return recentEntry?.injuryPart ?? null;
}
