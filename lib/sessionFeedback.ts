// 训后反馈本地草稿：云端失败时降级；权威源为 SessionFeedback 表。

import { STORAGE_KEYS } from "@/lib/storageKeys";
import { safeParseJSON } from "@/lib/safeParse";
import { isPainArea, type PainArea } from "@/lib/clinical/painAreas";

export const SESSION_FEEDBACK_SCHEMA_VERSION = 1;

export interface SessionFeedbackEntry {
  schemaVersion: number;
  id: string;
  playerId: string;
  playerName: string;
  date: string;
  sessionRpe: number;
  durationMin: number;
  hasPain: boolean;
  painArea: PainArea | null;
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
    painArea: isPainArea(entry.painArea) ? entry.painArea : null,
    note: typeof entry.note === "string" ? entry.note : null,
  }));
}

export function upsertSessionFeedbackDraft(
  entry: Omit<SessionFeedbackEntry, "schemaVersion" | "id" | "timestamp"> & {
    id?: string;
    timestamp?: number;
  }
): SessionFeedbackEntry {
  const full: SessionFeedbackEntry = {
    schemaVersion: SESSION_FEEDBACK_SCHEMA_VERSION,
    id: entry.id ?? crypto.randomUUID(),
    playerId: entry.playerId,
    playerName: entry.playerName,
    date: entry.date,
    sessionRpe: entry.sessionRpe,
    durationMin: entry.durationMin,
    hasPain: entry.hasPain,
    painArea: entry.painArea,
    note: entry.note,
    timestamp: entry.timestamp ?? Date.now(),
  };
  const existing = loadSessionFeedbackDrafts().filter(
    (item) => !(item.playerId === full.playerId && item.date === full.date)
  );
  localStorage.setItem(
    STORAGE_KEYS.sessionFeedback,
    JSON.stringify([...existing, full])
  );
  return full;
}
