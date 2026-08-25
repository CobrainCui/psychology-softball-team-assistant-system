// 训后反馈本地草稿：云端失败时降级；权威源为 SessionFeedback 表。同日可多条。

import { STORAGE_KEYS } from "@/lib/storageKeys";
import { safeParseJSON } from "@/lib/safeParse";
import {
  readScopedItem,
  writeScopedItem,
  type DraftScope,
} from "@/lib/scopedStorage";
import { parseActivityTypes } from "@/lib/clinical/activityTypes";

export const SESSION_FEEDBACK_SCHEMA_VERSION = 4;

export type SessionFeedbackSyncStatus = "pending" | "failed";

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
  syncStatus?: SessionFeedbackSyncStatus;
  failedReason?: string | null;
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
    syncStatus: entry.syncStatus === "failed" ? "failed" : "pending",
    failedReason:
      typeof entry.failedReason === "string" ? entry.failedReason : undefined,
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
    syncStatus: "pending",
  };
  const existing = loadSessionFeedbackDrafts(scope);
  const index = existing.findIndex((row) => row.id === full.id);
  const next =
    index === -1
      ? [...existing, full]
      : existing.map((row, i) => (i === index ? full : row));
  writeScopedItem(
    STORAGE_KEYS.sessionFeedback,
    scope,
    JSON.stringify(next)
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
    syncStatus: "pending",
    failedReason: undefined,
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
    (entry) =>
      entry.playerId === playerId &&
      entry.date === date &&
      entry.syncStatus !== "failed"
  );
}

export function isFeedbackPending(entry: SessionFeedbackEntry): boolean {
  return entry.syncStatus !== "failed";
}

export function markSessionFeedbackFailed(
  scope: DraftScope | null,
  id: string,
  reason: string
): void {
  const updated = loadSessionFeedbackDrafts(scope).map((entry) =>
    entry.id === id
      ? {
          ...entry,
          syncStatus: "failed" as const,
          failedReason: reason,
          schemaVersion: SESSION_FEEDBACK_SCHEMA_VERSION,
        }
      : entry
  );
  writeSessionFeedbackDrafts(scope, updated);
}

export function loadFailedSessionFeedbackDrafts(
  scope: DraftScope | null,
  playerId?: string
): SessionFeedbackEntry[] {
  return loadSessionFeedbackDrafts(scope).filter(
    (entry) =>
      entry.syncStatus === "failed" &&
      (!playerId || entry.playerId === playerId)
  );
}

export function loadPendingSessionFeedbackDrafts(
  scope: DraftScope | null
): SessionFeedbackEntry[] {
  return loadSessionFeedbackDrafts(scope).filter(isFeedbackPending);
}

export function pickLatestUnsyncedFeedbackDraftId(
  entries: Pick<SessionFeedbackEntry, "id" | "playerId" | "date" | "timestamp">[],
  playerId: string,
  date: string
): string | null {
  const rows = entries.filter(
    (entry) => entry.playerId === playerId && entry.date === date
  );
  if (rows.length === 0) return null;
  let latest = rows[0]!;
  for (const row of rows) {
    if (row.timestamp > latest.timestamp) latest = row;
  }
  return latest.id;
}

export function allocateFeedbackClientDraftId(input: {
  mode: "new" | "retry";
  retryDraftId: string | null;
  createId?: () => string;
}): string {
  // 推导步骤：新建永远新 UUID；只有显式重试未同步稿才复用 retryDraftId
  if (input.mode === "retry" && input.retryDraftId) return input.retryDraftId;
  return (input.createId ?? (() => crypto.randomUUID()))();
}

export function latestUnsyncedFeedbackDraftId(
  scope: DraftScope | null,
  playerId: string,
  date: string
): string | null {
  return pickLatestUnsyncedFeedbackDraftId(
    loadSessionFeedbackDrafts(scope),
    playerId,
    date
  );
}

export function reconcileSessionFeedbackDrafts(
  scope: DraftScope | null,
  playerId: string,
  date: string,
  cloud: { id: string; clientDraftId: string | null }[]
): void {
  // 推导步骤：云端行 id 或 clientDraftId 对上本机草稿则删本地，避免刷新后当新稿再提交
  const cloudIds = new Set(cloud.map((row) => row.id));
  const cloudDraftIds = new Set(
    cloud
      .map((row) => row.clientDraftId)
      .filter((id): id is string => typeof id === "string" && id.length > 0)
  );
  writeSessionFeedbackDrafts(
    scope,
    loadSessionFeedbackDrafts(scope).filter((entry) => {
      if (entry.playerId !== playerId || entry.date !== date) return true;
      return !cloudIds.has(entry.id) && !cloudDraftIds.has(entry.id);
    })
  );
}
