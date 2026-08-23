"use server";

import { prisma } from "@/lib/db";
import { errorMessage, type ActionResult } from "@/lib/actionResult";
import { writeAuditLog } from "@/lib/auth/audit";
import { requireTestDayDraftJoiner } from "@/lib/auth/actionGuard";
import { readClientIp } from "@/lib/auth/request";
import { Prisma } from "@/lib/generated/prisma/client";
import { COLLAB_TX_OPTIONS, lockTestDayDraft } from "@/lib/testDay/collab/draftLock";
import {
  ARCHIVE_ABANDON_WHILE_READY_ERROR,
  ARCHIVE_DEVICE_ID_REQUIRED_ERROR,
  ARCHIVE_OPEN_CONFLICT_ERROR,
  ARCHIVE_OUTBOX_COUNTS_REQUIRED_ERROR,
  ARCHIVE_SELF_FAILED_ERROR,
  ARCHIVE_SELF_PENDING_ERROR,
  clampOutboxCount,
  parseDeviceId,
} from "@/lib/testDay/collab/archiveReady";
import {
  clearAllDraftDeviceReady,
  loadArchiveGates,
  persistDeviceOutboxCounts,
  upsertDraftDevice,
} from "@/lib/testDay/collab/deviceGate";
import type { TestDayDeviceGate } from "@/lib/testDay/collab/dto";

export type ArchiveGatePayload = {
  deviceGates: TestDayDeviceGate[];
  allDevicesArchiveReady: boolean;
  selfDeviceReady: boolean;
};

async function requireOpenMemberDraft(
  tx: Prisma.TransactionClient,
  draftId: string,
  teamId: string,
  accountId: string
): Promise<ActionResult> {
  const draft = await tx.testDayDraft.findUnique({
    where: { id: draftId },
    select: { teamId: true, status: true },
  });
  if (!draft || draft.teamId !== teamId) {
    return { success: false, error: "场次不存在" };
  }
  if (draft.status === "archived") {
    return { success: false, error: "场次已归档" };
  }
  const member = await tx.testDayDraftMember.findUnique({
    where: {
      draftId_accountId: { draftId, accountId },
    },
    select: { id: true },
  });
  if (!member) return { success: false, error: "请先加入该场次" };
  return { success: true };
}

export async function confirmTestDayArchiveReady(
  draftId: string,
  deviceId: string,
  outbox: { pendingCount: number; failedCount: number }
): Promise<ActionResult<ArchiveGatePayload>> {
  try {
    const gate = await requireTestDayDraftJoiner();
    if (!gate.success) return gate;
    const parsed = parseDeviceId(deviceId);
    if (!parsed) {
      return { success: false, error: ARCHIVE_DEVICE_ID_REQUIRED_ERROR };
    }
    const pendingCount = clampOutboxCount(outbox?.pendingCount);
    const failedCount = clampOutboxCount(outbox?.failedCount);
    if (pendingCount == null || failedCount == null) {
      return { success: false, error: ARCHIVE_OUTBOX_COUNTS_REQUIRED_ERROR };
    }

    return await prisma.$transaction(async (tx) => {
      await lockTestDayDraft(tx, draftId);
      const memberGate = await requireOpenMemberDraft(
        tx,
        draftId,
        gate.ctx.teamId,
        gate.ctx.accountId
      );
      if (!memberGate.success) return memberGate;

      const device = await upsertDraftDevice(tx, {
        draftId,
        accountId: gate.ctx.accountId,
        deviceId: parsed,
      });
      if (!device.ok) return { success: false as const, error: device.error };

      // 推导步骤：条数与确认同一事务落库；有待同步/失败/open 冲突则不得标 ready
      await persistDeviceOutboxCounts(tx, device.id, pendingCount, failedCount);
      if (pendingCount > 0 || failedCount > 0) {
        await tx.testDayDraftDevice.update({
          where: { id: device.id },
          data: { archiveReadyAt: null },
        });
        return {
          success: false as const,
          error:
            pendingCount > 0
              ? ARCHIVE_SELF_PENDING_ERROR
              : ARCHIVE_SELF_FAILED_ERROR,
        };
      }
      const openConflicts = await tx.testDayConflict.count({
        where: { draftId, reviewStatus: "open" },
      });
      if (openConflicts > 0) {
        await tx.testDayDraftDevice.update({
          where: { id: device.id },
          data: { archiveReadyAt: null },
        });
        return {
          success: false as const,
          error: ARCHIVE_OPEN_CONFLICT_ERROR,
        };
      }

      await tx.testDayDraftDevice.update({
        where: { id: device.id },
        data: { archiveReadyAt: new Date() },
      });
      const gates = await loadArchiveGates(tx, draftId, parsed);
      return { success: true as const, ...gates };
    }, COLLAB_TX_OPTIONS);
  } catch (error) {
    console.error("确认测试日已同步失败:", error);
    return { success: false, error: errorMessage(error) };
  }
}

export async function reportTestDayDeviceOutbox(
  draftId: string,
  deviceId: string,
  outbox: { pendingCount: number; failedCount: number }
): Promise<ActionResult<ArchiveGatePayload>> {
  try {
    const gate = await requireTestDayDraftJoiner();
    if (!gate.success) return gate;
    const parsed = parseDeviceId(deviceId);
    if (!parsed) {
      return { success: false, error: ARCHIVE_DEVICE_ID_REQUIRED_ERROR };
    }
    const pendingCount = clampOutboxCount(outbox?.pendingCount);
    const failedCount = clampOutboxCount(outbox?.failedCount);
    if (pendingCount == null || failedCount == null) {
      return { success: false, error: ARCHIVE_OUTBOX_COUNTS_REQUIRED_ERROR };
    }

    return await prisma.$transaction(async (tx) => {
      await lockTestDayDraft(tx, draftId);
      const memberGate = await requireOpenMemberDraft(
        tx,
        draftId,
        gate.ctx.teamId,
        gate.ctx.accountId
      );
      if (!memberGate.success) return memberGate;

      const device = await upsertDraftDevice(tx, {
        draftId,
        accountId: gate.ctx.accountId,
        deviceId: parsed,
      });
      if (!device.ok) return { success: false as const, error: device.error };

      await persistDeviceOutboxCounts(tx, device.id, pendingCount, failedCount);
      if (pendingCount > 0 || failedCount > 0) {
        await clearAllDraftDeviceReady(tx, draftId);
      }
      const gates = await loadArchiveGates(tx, draftId, parsed);
      return { success: true as const, ...gates };
    }, COLLAB_TX_OPTIONS);
  } catch (error) {
    console.error("上报测试日设备待同步失败:", error);
    return { success: false, error: errorMessage(error) };
  }
}

export async function clearTestDayArchiveReady(
  draftId: string,
  deviceId: string
): Promise<ActionResult<ArchiveGatePayload>> {
  try {
    const gate = await requireTestDayDraftJoiner();
    if (!gate.success) return gate;
    const parsed = parseDeviceId(deviceId);
    if (!parsed) {
      return { success: false, error: ARCHIVE_DEVICE_ID_REQUIRED_ERROR };
    }

    return await prisma.$transaction(async (tx) => {
      await lockTestDayDraft(tx, draftId);
      const memberGate = await requireOpenMemberDraft(
        tx,
        draftId,
        gate.ctx.teamId,
        gate.ctx.accountId
      );
      if (!memberGate.success) return memberGate;

      const device = await upsertDraftDevice(tx, {
        draftId,
        accountId: gate.ctx.accountId,
        deviceId: parsed,
      });
      if (!device.ok) return { success: false as const, error: device.error };

      await tx.testDayDraftDevice.update({
        where: { id: device.id },
        data: { archiveReadyAt: null },
      });
      const gates = await loadArchiveGates(tx, draftId, parsed);
      return { success: true as const, ...gates };
    }, COLLAB_TX_OPTIONS);
  } catch (error) {
    console.error("取消测试日同步确认失败:", error);
    return { success: false, error: errorMessage(error) };
  }
}

export async function abandonTestDayFailedOutbox(input: {
  draftId: string;
  deviceId: string;
  dedupeKey: string;
  kind: string;
  failedReason?: string;
}): Promise<ActionResult> {
  try {
    const gate = await requireTestDayDraftJoiner();
    if (!gate.success) return gate;
    const parsed = parseDeviceId(input.deviceId);
    if (!parsed) {
      return { success: false, error: ARCHIVE_DEVICE_ID_REQUIRED_ERROR };
    }
    if (
      typeof input.draftId !== "string" ||
      typeof input.dedupeKey !== "string" ||
      !input.draftId.trim() ||
      !input.dedupeKey.trim()
    ) {
      return { success: false, error: "记录无效" };
    }
    const member = await prisma.testDayDraftMember.findUnique({
      where: {
        draftId_accountId: {
          draftId: input.draftId,
          accountId: gate.ctx.accountId,
        },
      },
      select: { id: true },
    });
    if (!member) return { success: false, error: "请先加入该场次" };

    const device = await prisma.testDayDraftDevice.findUnique({
      where: {
        draftId_deviceId: { draftId: input.draftId, deviceId: parsed },
      },
      select: { archiveReadyAt: true, accountId: true },
    });
    if (device && device.accountId !== gate.ctx.accountId) {
      return { success: false, error: "该设备已绑定其他账号" };
    }
    if (device?.archiveReadyAt) {
      return { success: false, error: ARCHIVE_ABANDON_WHILE_READY_ERROR };
    }

    const ip = await readClientIp();
    await writeAuditLog({
      action: "test_day_outbox_abandoned",
      actorAccountId: gate.ctx.accountId,
      targetId: input.draftId,
      ip,
      metadata: {
        draftId: input.draftId,
        deviceId: parsed,
        dedupeKey: input.dedupeKey,
        kind: input.kind,
        failedReason: input.failedReason ?? null,
      },
    });
    return { success: true };
  } catch (error) {
    console.error("放弃测试日失败记录审计失败:", error);
    return { success: false, error: errorMessage(error) };
  }
}
