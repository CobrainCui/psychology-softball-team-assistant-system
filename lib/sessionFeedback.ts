// 训后反馈本地草稿：云端失败时降级；权威源为 SessionFeedback 表。同日可多条。

import { STORAGE_KEYS } from "@/lib/storageKeys";
import { safeParseJSON } from "@/lib/safeParse";
import {
  readScopedItem,
  writeScopedItem,
  type DraftScope,
} from "@/lib/scopedStorage";
import { parseActivityTypes } from "@/lib/clinical/activityTypes";

export const SESSION_FEEDBACK_SCHEMA_VERSION = 3;

export interface SessionFeedbackEntry {
  schemaVersion: number;
  id: string;
  playerId: string;
  playerName: string;
  date: string;
  activityTypes: string[];
  sessionRpe: number;
  note: string | null;
  timestamp: number;
}

function migrateSessionFeedbackEntry(
  value: unknown
): SessionFeedbackEntry | null {
  if (!value || typeof value !== "object") return null;
  const entry = value as Record<string, unknown>;
  if (
    typeof entry.id !== "string" ||
    typeof entry.playerId !== "string" ||
    typeof entry.date !== "string" ||
    typeof entry.sessionRpe !== "number"
  ) {
    return null;
  }
  const activityTypes = Array.isArray(entry.activityTypes)
    ? parseActivityTypes(entry.activityTypes)
    : parseActivityTypes(
        typeof entry.activityType === "string" ? [entry.activityType] : []
      );
  return {
    schemaVersion: SESSION_FEEDBACK_SCHEMA_VERSION,
    id: entry.id,
    playerId: entry.playerId,
    playerName: typeof entry.playerName === "string" ? entry.playerName : "",
    date: entry.date,
    activityTypes,
    sessionRpe: entry.sessionRpe,
    note: typeof entry.note === "string" ? entry.note : null,
    timestamp: typeof entry.timestamp === "number" ? entry.timestamp : Date.now(),
  };
}

export function loadSessionFeedbackDrafts(
  scope: DraftScope | null
): SessionFeedbackEntry[] {
  const raw = readScopedItem(STORAGE_KEYS.sessionFeedback, scope);
  const parsed = safeParseJSON<unknown>(raw, []);
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map(migrateSessionFeedbackEntry)
    .filter((entry): entry is SessionFeedbackEntry => entry !== null);
}

export function appendSessionFeedbackDraft(
  scope: DraftScope | null,
  entry: Omit<
    SessionFeedbackEntry,
    "schemaVersion" | "id" | "timestamp"
  > & {
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
    activityTypes: parseActivityTypes(entry.activityTypes),
    sessionRpe: entry.sessionRpe,
    note: entry.note,
    timestamp: entry.timestamp ?? Date.now(),
  };
  const existing = loadSessionFeedbackDrafts(scope);
  writeScopedItem(
    STORAGE_KEYS.sessionFeedback,
    scope,
    JSON.stringify([...existing, full])
  );
  return full;
}

function writeSessionFeedbackDrafts(
  scope: DraftScope | null,
  entries: SessionFeedbackEntry[]
): void {
  writeScopedItem(
    STORAGE_KEYS.sessionFeedback,
    scope,
    JSON.stringify(entries)
  );
}

export function updateSessionFeedbackDraft(
  scope: DraftScope | null,
  id: string,
  patch: Partial<
    Pick<SessionFeedbackEntry, "activityTypes" | "sessionRpe" | "note">
  >
): SessionFeedbackEntry | null {
  const existing = loadSessionFeedbackDrafts(scope);
  const index = existing.findIndex((entry) => entry.id === id);
  if (index === -1) return null;
  const current = existing[index]!;
  const next: SessionFeedbackEntry = {
    ...current,
    ...patch,
    activityTypes: parseActivityTypes(
      patch.activityTypes ?? current.activityTypes
    ),
    timestamp: Date.now(),
  };
  const updated = [...existing];
  updated[index] = next;
  writeSessionFeedbackDrafts(scope, updated);
  return next;
}

export function deleteSessionFeedbackDraft(
  scope: DraftScope | null,
  id: string
): void {
  writeSessionFeedbackDrafts(
    scope,
    loadSessionFeedbackDrafts(scope).filter((entry) => entry.id !== id)
  );
}

export function loadPlayerSessionFeedbackDrafts(
  scope: DraftScope | null,
  playerId: string,
  date: string
): SessionFeedbackEntry[] {
  return loadSessionFeedbackDrafts(scope).filter(
    (entry) => entry.playerId === playerId && entry.date === date
  );
}
