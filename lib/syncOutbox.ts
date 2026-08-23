// 账号分区待同步队列：只存云端测试日失败的 Entry/tombstone。
// 评估/训后仍用既有本机草稿；成功前不得标成已上云。
// 永久拒绝不得静默删除，须进入失败匣让用户看见。

import { STORAGE_KEYS } from "@/lib/storageKeys";
import { safeParseJSON } from "@/lib/safeParse";
import {
  readScopedItem,
  writeScopedItem,
  type DraftScope,
} from "@/lib/scopedStorage";
import {
  TEST_DAY_ENTRY_KINDS,
  type TestDayEntryKind,
} from "@/lib/testDay/collab/types";

export const SYNC_OUTBOX_SCHEMA_VERSION = 2;

export const PENDING_SYNC_COPY =
  "待同步，本机未上云。恢复网络后会自动重试；教练和其他设备暂时看不到。";

export const FAILED_SYNC_COPY =
  "这些本机记录未能上云（已过可写窗口、场次已归档或请求被拒绝），不会再自动重试。";

export const ARCHIVE_PENDING_SYNC_ERROR =
  "本机还有待同步成绩，归档会丢记录。请恢复网络并等待同步后再归档。";

export type SyncOutboxKind = "test_day_entry" | "test_day_tombstone";
export type SyncOutboxStatus = "pending" | "failed";

export type TestDayEntryOutboxPayload = {
  draftId: string;
  kind: TestDayEntryKind;
  payload: unknown;
  deviceId?: string;
};

export type TestDayTombstoneOutboxPayload = {
  draftId: string;
  clientEntryId: string;
  deviceId?: string;
};

export type SyncOutboxItem = {
  schemaVersion: typeof SYNC_OUTBOX_SCHEMA_VERSION;
  id: string;
  kind: SyncOutboxKind;
  status: SyncOutboxStatus;
  dedupeKey: string;
  createdAt: number;
  attempts: number;
  payload: TestDayEntryOutboxPayload | TestDayTombstoneOutboxPayload;
  failedReason?: string;
  failedAt?: number;
};

const KIND_SET = new Set<SyncOutboxKind>([
  "test_day_entry",
  "test_day_tombstone",
]);
const ENTRY_KIND_SET = new Set<string>(TEST_DAY_ENTRY_KINDS);

export function testDayEntryDedupeKey(
  draftId: string,
  clientEntryId: string
): string {
  return `entry:${draftId}:${clientEntryId}`;
}

export function testDayTombstoneDedupeKey(
  draftId: string,
  clientEntryId: string
): string {
  return `tombstone:${draftId}:${clientEntryId}`;
}

export function outboxItemDraftId(item: SyncOutboxItem): string {
  return item.payload.draftId;
}

// 推导步骤：业务拒绝重试无意义；网络/未知错误才留在待同步队列
export function isPermanentSyncReject(error: string): boolean {
  return /已归档|场次不存在|请先加入|请先登录|未登录|仅可修改或删除当日|date 须为|须为|无效|无此队员|没有权限|禁止|会话过期|已确认同步|须带本机 deviceId|取消确认/.test(
    error
  );
}

function isEntryPayload(
  value: unknown
): value is TestDayEntryOutboxPayload {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.draftId === "string" &&
    typeof row.kind === "string" &&
    ENTRY_KIND_SET.has(row.kind)
  );
}

function isTombstonePayload(
  value: unknown
): value is TestDayTombstoneOutboxPayload {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.draftId === "string" && typeof row.clientEntryId === "string"
  );
}

function migrateItem(value: unknown): SyncOutboxItem | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (
    typeof row.id !== "string" ||
    typeof row.dedupeKey !== "string" ||
    typeof row.kind !== "string" ||
    !KIND_SET.has(row.kind as SyncOutboxKind)
  ) {
    return null;
  }
  const kind = row.kind as SyncOutboxKind;
  if (kind === "test_day_entry" && !isEntryPayload(row.payload)) return null;
  if (kind === "test_day_tombstone" && !isTombstonePayload(row.payload)) {
    return null;
  }
  const status: SyncOutboxStatus =
    row.status === "failed" ? "failed" : "pending";
  return {
    schemaVersion: SYNC_OUTBOX_SCHEMA_VERSION,
    id: row.id,
    kind,
    status,
    dedupeKey: row.dedupeKey,
    createdAt: typeof row.createdAt === "number" ? row.createdAt : Date.now(),
    attempts: typeof row.attempts === "number" ? row.attempts : 0,
    payload: row.payload as SyncOutboxItem["payload"],
    failedReason:
      typeof row.failedReason === "string" ? row.failedReason : undefined,
    failedAt: typeof row.failedAt === "number" ? row.failedAt : undefined,
  };
}

export function loadSyncOutbox(scope: DraftScope | null): SyncOutboxItem[] {
  const raw = readScopedItem(STORAGE_KEYS.syncOutbox, scope);
  const parsed = safeParseJSON<unknown>(raw, []);
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map(migrateItem)
    .filter((item): item is SyncOutboxItem => item !== null);
}

export function loadPendingSyncOutbox(
  scope: DraftScope | null
): SyncOutboxItem[] {
  return loadSyncOutbox(scope).filter((row) => row.status === "pending");
}

export function loadFailedSyncOutbox(
  scope: DraftScope | null
): SyncOutboxItem[] {
  return loadSyncOutbox(scope).filter((row) => row.status === "failed");
}

export function countPendingTestDayOutbox(
  scope: DraftScope | null,
  draftId: string
): number {
  return loadPendingSyncOutbox(scope).filter(
    (row) => outboxItemDraftId(row) === draftId
  ).length;
}

export function countFailedTestDayOutbox(
  scope: DraftScope | null,
  draftId: string
): number {
  return loadFailedSyncOutbox(scope).filter(
    (row) => outboxItemDraftId(row) === draftId
  ).length;
}

function saveSyncOutbox(
  scope: DraftScope | null,
  items: SyncOutboxItem[]
): void {
  writeScopedItem(STORAGE_KEYS.syncOutbox, scope, JSON.stringify(items));
}

export function upsertSyncOutboxItem(
  scope: DraftScope | null,
  input: {
    kind: SyncOutboxKind;
    dedupeKey: string;
    payload: SyncOutboxItem["payload"];
  }
): SyncOutboxItem[] {
  const existing = loadSyncOutbox(scope);
  const prev = existing.find((row) => row.dedupeKey === input.dedupeKey);
  const nextItem: SyncOutboxItem = {
    schemaVersion: SYNC_OUTBOX_SCHEMA_VERSION,
    id: prev?.id ?? crypto.randomUUID(),
    kind: input.kind,
    status: "pending",
    dedupeKey: input.dedupeKey,
    createdAt: Date.now(),
    attempts: prev?.attempts ?? 0,
    payload: input.payload,
  };
  const without = existing.filter((row) => row.dedupeKey !== input.dedupeKey);
  const updated = [...without, nextItem];
  saveSyncOutbox(scope, updated);
  return updated;
}

export function removeSyncOutboxItem(
  scope: DraftScope | null,
  dedupeKey: string
): SyncOutboxItem[] {
  const updated = loadSyncOutbox(scope).filter(
    (row) => row.dedupeKey !== dedupeKey
  );
  saveSyncOutbox(scope, updated);
  return updated;
}

export function retrySyncOutboxItem(
  scope: DraftScope | null,
  dedupeKey: string
): SyncOutboxItem[] {
  const updated = loadSyncOutbox(scope).map((row) =>
    row.dedupeKey === dedupeKey
      ? {
          ...row,
          status: "pending" as const,
          failedReason: undefined,
          failedAt: undefined,
        }
      : row
  );
  saveSyncOutbox(scope, updated);
  return updated;
}

export function markSyncOutboxFailed(
  scope: DraftScope | null,
  dedupeKey: string,
  reason: string
): SyncOutboxItem[] {
  const updated = loadSyncOutbox(scope).map((row) =>
    row.dedupeKey === dedupeKey
      ? {
          ...row,
          status: "failed" as const,
          failedReason: reason,
          failedAt: Date.now(),
        }
      : row
  );
  saveSyncOutbox(scope, updated);
  return updated;
}

export function bumpSyncOutboxAttempt(
  scope: DraftScope | null,
  dedupeKey: string
): void {
  const updated = loadSyncOutbox(scope).map((row) =>
    row.dedupeKey === dedupeKey
      ? { ...row, attempts: row.attempts + 1 }
      : row
  );
  saveSyncOutbox(scope, updated);
}
