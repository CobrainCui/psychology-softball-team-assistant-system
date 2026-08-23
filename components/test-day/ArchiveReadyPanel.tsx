"use client";

import type { TestDayDeviceGate } from "@/lib/testDay/collab/dto";
import {
  ARCHIVE_OPEN_CONFLICT_ERROR,
  ARCHIVE_SELF_FAILED_ERROR,
  ARCHIVE_SELF_PENDING_ERROR,
} from "@/lib/testDay/collab/archiveReady";

export default function ArchiveReadyPanel({
  deviceGates,
  draftPendingCount,
  draftFailedCount,
  openConflictCount,
  busy,
  onConfirm,
  onClear,
}: {
  deviceGates: TestDayDeviceGate[];
  draftPendingCount: number;
  draftFailedCount: number;
  openConflictCount: number;
  busy: boolean;
  onConfirm: () => void;
  onClear: () => void;
}) {
  const self = deviceGates.find((row) => row.isSelf);
  const unready = deviceGates.filter((row) => !row.archiveReady);
  const blockedReason =
    openConflictCount > 0
      ? ARCHIVE_OPEN_CONFLICT_ERROR
      : draftFailedCount > 0
        ? ARCHIVE_SELF_FAILED_ERROR
        : draftPendingCount > 0
          ? ARCHIVE_SELF_PENDING_ERROR
          : null;

  return (
    <section className="border border-zinc-400 bg-white p-3">
      <p className="text-sm text-zinc-800">归档前每台录入设备须确认已同步</p>
      <p className="mt-1 text-xs text-zinc-500">
        确认后本机不能再录入，也不能放弃失败记录，须先取消确认。其他设备须各自确认。
      </p>
      <ul className="mt-2 flex flex-col gap-1 text-xs text-zinc-700">
        {deviceGates.map((row) => (
          <li key={row.deviceId}>
            {row.label}
            {row.isSelf ? "（本机）" : ""}
            {row.archiveReady ? " · 已确认，已锁定录入" : " · 未确认"}
          </li>
        ))}
      </ul>
      {unready.length > 0 ? (
        <p className="mt-2 text-xs text-amber-800">
          尚有 {unready.length} 台设备未确认，队长/教练暂不能归档。
        </p>
      ) : null}
      {self?.archiveReady ? (
        <button
          type="button"
          disabled={busy}
          onClick={onClear}
          className="mt-3 w-full border border-zinc-400 py-2 text-sm text-zinc-800 hover:bg-zinc-100"
        >
          取消确认（解锁本机录入）
        </button>
      ) : (
        <button
          type="button"
          disabled={busy || Boolean(blockedReason)}
          onClick={onConfirm}
          className="mt-3 w-full border border-zinc-400 py-2 text-sm text-zinc-800 hover:bg-zinc-100 disabled:bg-zinc-100 disabled:text-zinc-400"
        >
          {openConflictCount > 0
            ? "先裁决冲突再确认"
            : draftFailedCount > 0
            ? "失败记录处理后再确认"
            : draftPendingCount > 0
              ? "待同步完成后再确认"
              : "确认本机已同步"}
        </button>
      )}
    </section>
  );
}
