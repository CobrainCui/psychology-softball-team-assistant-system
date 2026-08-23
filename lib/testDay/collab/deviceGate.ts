import type { Prisma } from "@/lib/generated/prisma/client";
import { buildArchiveGateFields } from "@/lib/testDay/collab/dto";
import {
  ARCHIVE_DEVICE_ID_REQUIRED_ERROR,
  DEVICE_BOUND_OTHER_ACCOUNT_ERROR,
  parseDeviceId,
} from "@/lib/testDay/collab/archiveReady";

type Tx = Prisma.TransactionClient;

export const memberSelect = {
  accountId: true,
} as const;

export const deviceGateSelect = {
  deviceId: true,
  accountId: true,
  archiveReadyAt: true,
  pendingOutboxCount: true,
  failedOutboxCount: true,
  account: { select: { username: true } },
} as const;

export async function loadArchiveGates(
  db: {
    testDayDraftMember: { findMany: Tx["testDayDraftMember"]["findMany"] };
    testDayDraftDevice: { findMany: Tx["testDayDraftDevice"]["findMany"] };
  },
  draftId: string,
  viewerDeviceId: string | null
) {
  const [members, devices] = await Promise.all([
    db.testDayDraftMember.findMany({
      where: { draftId },
      select: memberSelect,
    }),
    db.testDayDraftDevice.findMany({
      where: { draftId },
      select: deviceGateSelect,
      orderBy: { createdAt: "asc" },
    }),
  ]);
  return buildArchiveGateFields({
    members,
    devices,
    viewerDeviceId,
  });
}

export type DeviceUpsertOk = {
  ok: true;
  id: string;
  archiveReadyAt: Date | null;
};
export type DeviceUpsertErr = { ok: false; error: string };
export type DeviceUpsertResult = DeviceUpsertOk | DeviceUpsertErr;

export async function upsertDraftDevice(
  tx: Tx,
  input: { draftId: string; accountId: string; deviceId: unknown }
): Promise<DeviceUpsertResult> {
  const deviceId = parseDeviceId(input.deviceId);
  if (!deviceId) {
    return { ok: false, error: ARCHIVE_DEVICE_ID_REQUIRED_ERROR };
  }
  const existing = await tx.testDayDraftDevice.findUnique({
    where: {
      draftId_deviceId: { draftId: input.draftId, deviceId },
    },
    select: { id: true, accountId: true, archiveReadyAt: true },
  });
  if (existing) {
    if (existing.accountId !== input.accountId) {
      return { ok: false, error: DEVICE_BOUND_OTHER_ACCOUNT_ERROR };
    }
    const updated = await tx.testDayDraftDevice.update({
      where: { id: existing.id },
      data: { lastSeenAt: new Date() },
      select: { id: true, archiveReadyAt: true },
    });
    return { ok: true, ...updated };
  }
  const created = await tx.testDayDraftDevice.create({
    data: {
      draftId: input.draftId,
      accountId: input.accountId,
      deviceId,
    },
    select: { id: true, archiveReadyAt: true },
  });
  return { ok: true, ...created };
}

export async function clearAllDraftDeviceReady(
  tx: Tx,
  draftId: string
): Promise<void> {
  await tx.testDayDraftDevice.updateMany({
    where: { draftId, archiveReadyAt: { not: null } },
    data: { archiveReadyAt: null },
  });
}

export async function persistDeviceOutboxCounts(
  tx: Tx,
  deviceRowId: string,
  pendingCount: number,
  failedCount: number
): Promise<void> {
  // 推导步骤：条数与设备行同一事务更新，确认时才能复核，不能只信当次请求
  await tx.testDayDraftDevice.update({
    where: { id: deviceRowId },
    data: {
      pendingOutboxCount: pendingCount,
      failedOutboxCount: failedCount,
      outboxReportedAt: new Date(),
      lastSeenAt: new Date(),
    },
  });
}
