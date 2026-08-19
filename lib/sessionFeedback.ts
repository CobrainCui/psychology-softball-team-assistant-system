// 训后反馈本地草稿：云端失败时降级；权威源为 SessionFeedback 表。同日可多条。

import { STORAGE_KEYS } from "@/lib/storageKeys";
import { safeParseJSON } from "@/lib/safeParse";
import {
  computeSessionLoad,
  isActivityType,
  type ActivityType,
} from "@/lib/clinical/activityTypes";

export const SESSION_FEEDBACK_SCHEMA_VERSION = 2;

export interface SessionFeedbackEntry {
  schemaVersion: number;
  id: string;
  playerId: string;
  playerName: string;
  date: string;
  activityType: ActivityType;
  sessionRpe: number;
  durationMin: number;
  sessionLoad: number;
  note: string | null;
  timestamp: number;
}

function isSessionFeedbackEntry(
  value: unknown
): value is SessionFeedbackEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.id === "string" &&
    typeof entry.playerId === "string" &&
    typeof entry.date === "string" &&
    typeof entry.sessionRpe === "number" &&
    typeof entry.durationMin === "number"
  );
}

export function loadSessionFeedbackDrafts(): SessionFeedbackEntry[] {
  const raw = localStorage.getItem(STORAGE_KEYS.sessionFeedback);
  const parsed = safeParseJSON<unknown>(raw, []);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(isSessionFeedbackEntry).map((entry) => ({
    ...entry,
    activityType: isActivityType(entry.activityType)
      ? entry.activityType
      : "other",
    sessionLoad:
      typeof entry.sessionLoad === "number"
        ? entry.sessionLoad
        : computeSessionLoad(entry.sessionRpe, entry.durationMin),
    note: typeof entry.note === "string" ? entry.note : null,
  }));
}

export function appendSessionFeedbackDraft(
  entry: Omit<SessionFeedbackEntry, "schemaVersion" | "id" | "timestamp" | "sessionLoad"> & {
    id?: string;
    timestamp?: number;
    sessionLoad?: number;
  }
): SessionFeedbackEntry {
  const full: SessionFeedbackEntry = {
    schemaVersion: SESSION_FEEDBACK_SCHEMA_VERSION,
    id: entry.id ?? crypto.randomUUID(),
    playerId: entry.playerId,
    playerName: entry.playerName,
    date: entry.date,
    activityType: entry.activityType,
    sessionRpe: entry.sessionRpe,
    durationMin: entry.durationMin,
    sessionLoad:
      entry.sessionLoad ??
      computeSessionLoad(entry.sessionRpe, entry.durationMin),
    note: entry.note,
    timestamp: entry.timestamp ?? Date.now(),
  };
  const existing = loadSessionFeedbackDrafts();
  localStorage.setItem(
    STORAGE_KEYS.sessionFeedback,
    JSON.stringify([...existing, full])
  );
  return full;
}

function writeSessionFeedbackDrafts(entries: SessionFeedbackEntry[]): void {
  localStorage.setItem(STORAGE_KEYS.sessionFeedback, JSON.stringify(entries));
}

export function updateSessionFeedbackDraft(
  id: string,
  patch: Partial<
    Pick<
      SessionFeedbackEntry,
      "activityType" | "sessionRpe" | "durationMin" | "note"
    >
  >
): SessionFeedbackEntry | null {
  const existing = loadSessionFeedbackDrafts();
  const index = existing.findIndex((entry) => entry.id === id);
  if (index === -1) return null;
  const current = existing[index]!;
  const sessionRpe = patch.sessionRpe ?? current.sessionRpe;
  const durationMin = patch.durationMin ?? current.durationMin;
  const next: SessionFeedbackEntry = {
    ...current,
    ...patch,
    sessionRpe,
    durationMin,
    sessionLoad: computeSessionLoad(sessionRpe, durationMin),
    timestamp: Date.now(),
  };
  const updated = [...existing];
  updated[index] = next;
  writeSessionFeedbackDrafts(updated);
  return next;
}

export function deleteSessionFeedbackDraft(id: string): void {
  writeSessionFeedbackDrafts(
    loadSessionFeedbackDrafts().filter((entry) => entry.id !== id)
  );
}

export function loadPlayerSessionFeedbackDrafts(
  playerId: string,
  date: string
): SessionFeedbackEntry[] {
  return loadSessionFeedbackDrafts().filter(
    (entry) => entry.playerId === playerId && entry.date === date
  );
}
