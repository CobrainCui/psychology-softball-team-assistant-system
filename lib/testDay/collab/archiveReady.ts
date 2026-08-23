// 测试日按设备归档门闩：确认后该设备禁写；不能只靠客户端 outbox 计数。

export const ARCHIVE_DEVICES_NOT_READY_ERROR =
  "还有录入设备未确认本机已同步，不能归档";

/** @deprecated 文案与 ARCHIVE_DEVICES_NOT_READY_ERROR 相同，保留给旧测试导入 */
export const ARCHIVE_MEMBERS_NOT_READY_ERROR = ARCHIVE_DEVICES_NOT_READY_ERROR;

export const ARCHIVE_DEVICE_LOCKED_ERROR =
  "本机已确认同步，不能再录入。请先取消确认。";

export const ARCHIVE_DEVICE_ID_REQUIRED_ERROR = "须带本机 deviceId";

export const ARCHIVE_SELF_PENDING_ERROR =
  "本机仍有待同步记录，不能确认已同步";

export const ARCHIVE_SELF_FAILED_ERROR =
  "本机还有未能上云的记录，不能确认已同步。请重试或放弃并记录。";

export const ARCHIVE_OPEN_CONFLICT_ERROR = "仍有未裁决冲突，不能确认已同步";

export const ARCHIVE_INFLIGHT_ERROR = "还有正在提交的记录，请稍后再确认";

export const ARCHIVE_ABANDON_WHILE_READY_ERROR =
  "本机已确认同步，不能放弃失败记录。请先取消确认。";

export const ARCHIVE_OUTBOX_COUNTS_REQUIRED_ERROR = "须上报本机待同步条数";

export const DEVICE_BOUND_OTHER_ACCOUNT_ERROR = "该设备已绑定其他账号";

export function clampOutboxCount(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value)) return null;
  if (value < 0 || value > 999) return null;
  return value;
}

export function canConfirmArchiveReady(input: {
  pendingCount: number;
  failedCount: number;
  inflightCount?: number;
  openConflictCount?: number;
}): { ok: true } | { ok: false; error: string } {
  if ((input.inflightCount ?? 0) > 0) {
    return { ok: false, error: ARCHIVE_INFLIGHT_ERROR };
  }
  if ((input.openConflictCount ?? 0) > 0) {
    return { ok: false, error: ARCHIVE_OPEN_CONFLICT_ERROR };
  }
  if (input.pendingCount > 0) {
    return { ok: false, error: ARCHIVE_SELF_PENDING_ERROR };
  }
  if (input.failedCount > 0) {
    return { ok: false, error: ARCHIVE_SELF_FAILED_ERROR };
  }
  return { ok: true };
}

export type ArchiveReadyDevice = {
  accountId: string;
  archiveReadyAt: Date | null;
  pendingOutboxCount: number;
  failedOutboxCount: number;
};

export function isDeviceArchiveReady(row: ArchiveReadyDevice): boolean {
  return (
    row.archiveReadyAt != null &&
    row.pendingOutboxCount === 0 &&
    row.failedOutboxCount === 0
  );
}

export function parseDeviceId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const id = value.trim();
  if (id.length < 8 || id.length > 80) return null;
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) return null;
  return id;
}

export function archiveDevicesReady(input: {
  members: { accountId: string }[];
  devices: ArchiveReadyDevice[];
}): boolean {
  if (input.members.length === 0 || input.devices.length === 0) return false;
  if (input.devices.some((row) => !isDeviceArchiveReady(row))) return false;
  return input.members.every((member) =>
    input.devices.some((row) => row.accountId === member.accountId)
  );
}
