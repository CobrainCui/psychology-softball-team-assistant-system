"use server";

import { prisma } from "@/lib/db";
import { errorMessage, type ActionResult } from "@/lib/actionResult";
import { requireTestDayDraftJoiner } from "@/lib/auth/actionGuard";
import { Prisma } from "@/lib/generated/prisma/client";
import {
  conflictAfterAuthorWithdraw,
  decideEntryMerge,
  parseCandidateIds,
} from "@/lib/testDay/collab/merge";
import {
  COLLAB_TX_OPTIONS,
  lockTestDayDraft,
  upsertOpenConflict,
} from "@/lib/testDay/collab/draftLock";
import { toStoredEntry } from "@/lib/testDay/collab/dto";
import { validateEntryPayload } from "@/lib/testDay/collab/validatePayload";
import type { TestDayEntryKind } from "@/lib/testDay/collab/types";
import {
  ARCHIVE_DEVICE_LOCKED_ERROR,
} from "@/lib/testDay/collab/archiveReady";
import {
  clearAllDraftDeviceReady,
  upsertDraftDevice,
} from "@/lib/testDay/collab/deviceGate";

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

async function requireWritableDevice(
  tx: Prisma.TransactionClient,
  input: { draftId: string; accountId: string; deviceId: unknown }
): Promise<{ success: true } | { success: false; error: string }> {
  const device = await upsertDraftDevice(tx, input);
  if (!device.ok) return { success: false, error: device.error };
  if (device.archiveReadyAt) {
    // 推导步骤：确认后仍来写，说明本机还有未上云成绩；清全场确认，避免带着缺成绩归档
    await clearAllDraftDeviceReady(tx, input.draftId);
    return { success: false, error: ARCHIVE_DEVICE_LOCKED_ERROR };
  }
  return { success: true };
}

export async function submitTestDayEntry(input: {
  draftId: string;
  kind: TestDayEntryKind;
  payload: unknown;
  deviceId: string;
}): Promise<ActionResult<{ id: string; conflicted: boolean }>> {
  try {
    const gate = await requireTestDayDraftJoiner();
    if (!gate.success) return gate;

    const parsed = validateEntryPayload(input.kind, input.payload);
    if (!parsed.ok) return { success: false, error: parsed.error };

    return await prisma.$transaction(async (tx) => {
      await lockTestDayDraft(tx, input.draftId);
      const draft = await tx.testDayDraft.findUnique({
        where: { id: input.draftId },
        select: {
          teamId: true,
          status: true,
          members: { select: { accountId: true } },
          entries: true,
        },
      });
      if (!draft || draft.teamId !== gate.ctx.teamId) {
        return { success: false as const, error: "场次不存在" };
      }
      if (draft.status === "archived") {
        return { success: false as const, error: "草稿已归档，不能继续提交" };
      }
      if (!draft.members.some((row) => row.accountId === gate.ctx.accountId)) {
        return { success: false as const, error: "请先加入该场次" };
      }
      const writable = await requireWritableDevice(tx, {
        draftId: input.draftId,
        accountId: gate.ctx.accountId,
        deviceId: input.deviceId,
      });
      if (!writable.success) return writable;

      const decision = decideEntryMerge({
        kind: input.kind,
        entityKey: parsed.entityKey,
        clientEntryId: parsed.clientEntryId,
        payload: input.payload,
        existing: draft.entries.map(toStoredEntry),
      });

      if (decision.action === "idempotent" || decision.action === "reuse_same_value") {
        return { success: true as const, id: decision.existing.id, conflicted: false };
      }

      let created: { id: string };
      try {
        created = await tx.testDayEntry.create({
          data: {
            draftId: input.draftId,
            kind: input.kind,
            entityKey: parsed.entityKey,
            payload: toJson(input.payload),
            clientEntryId: parsed.clientEntryId,
            authorAccountId: gate.ctx.accountId,
          },
          select: { id: true },
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          const existing = await tx.testDayEntry.findUnique({
            where: {
              draftId_clientEntryId: {
                draftId: input.draftId,
                clientEntryId: parsed.clientEntryId,
              },
            },
            select: { id: true, status: true },
          });
          if (existing?.status === "active") {
            return { success: true as const, id: existing.id, conflicted: false };
          }
          if (existing?.status === "tombstoned") {
            return {
              success: false as const,
              error: "该记录已删除，请以新 id 提交修订",
            };
          }
        }
        throw error;
      }

      if (decision.action === "insert_and_conflict") {
        await upsertOpenConflict(tx, {
          draftId: input.draftId,
          entityKey: parsed.entityKey,
          type: "value_mismatch",
          candidateIds: [...decision.existingIds, created.id],
        });
        await clearAllDraftDeviceReady(tx, input.draftId);
        return { success: true as const, id: created.id, conflicted: true };
      }

      await clearAllDraftDeviceReady(tx, input.draftId);
      return { success: true as const, id: created.id, conflicted: false };
    }, COLLAB_TX_OPTIONS);
  } catch (error) {
    console.error("提交协作记录失败:", error);
    return { success: false, error: errorMessage(error) };
  }
}

export async function tombstoneTestDayEntry(input: {
  draftId: string;
  clientEntryId: string;
  deviceId: string;
}): Promise<ActionResult<{ id: string }>> {
  try {
    const gate = await requireTestDayDraftJoiner();
    if (!gate.success) return gate;

    return await prisma.$transaction(async (tx) => {
      await lockTestDayDraft(tx, input.draftId);
      const entry = await tx.testDayEntry.findUnique({
        where: {
          draftId_clientEntryId: {
            draftId: input.draftId,
            clientEntryId: input.clientEntryId,
          },
        },
        select: {
          id: true,
          status: true,
          authorAccountId: true,
          entityKey: true,
          draft: {
            select: {
              teamId: true,
              status: true,
              members: { select: { accountId: true } },
            },
          },
        },
      });
      if (!entry || entry.draft.teamId !== gate.ctx.teamId) {
        return { success: false as const, error: "记录不存在" };
      }
      if (entry.draft.status === "archived") {
        return { success: false as const, error: "草稿已归档，不能删除" };
      }
      if (!entry.draft.members.some((row) => row.accountId === gate.ctx.accountId)) {
        return { success: false as const, error: "请先加入该场次" };
      }
      const writable = await requireWritableDevice(tx, {
        draftId: input.draftId,
        accountId: gate.ctx.accountId,
        deviceId: input.deviceId,
      });
      if (!writable.success) return writable;

      const openConflicts = await tx.testDayConflict.findMany({
        where: {
          draftId: input.draftId,
          entityKey: entry.entityKey,
          reviewStatus: "open",
        },
        select: {
          id: true,
          type: true,
          reviewStatus: true,
          candidateEntryIds: true,
        },
      });

      // 推导步骤：作者随时墓碑自己的记录；有 open 冲突则从候选撤回并按类型收口；非作者只提 delete_request
      if (entry.authorAccountId === gate.ctx.accountId) {
        if (entry.status !== "tombstoned") {
          await tx.testDayEntry.update({
            where: { id: entry.id },
            data: { status: "tombstoned" },
          });
        }
        for (const conflict of openConflicts) {
          const next = conflictAfterAuthorWithdraw({
            type: conflict.type,
            reviewStatus: conflict.reviewStatus,
            candidateEntryIds: parseCandidateIds(conflict.candidateEntryIds),
            withdrawnEntryId: entry.id,
          });
          if (next.action === "leave") continue;
          if (next.action === "resolve_as_withdrawn") {
            await tx.testDayConflict.update({
              where: { id: conflict.id },
              data: {
                reviewStatus: "resolved",
                finalPayload: toJson({ withdrawnByAuthor: true }),
                resolvedByAccountId: gate.ctx.accountId,
                resolvedAt: new Date(),
              },
            });
          } else if (next.action === "dismiss") {
            await tx.testDayConflict.update({
              where: { id: conflict.id },
              data: {
                reviewStatus: "dismissed",
                resolvedByAccountId: gate.ctx.accountId,
                resolvedAt: new Date(),
              },
            });
          } else {
            await tx.testDayConflict.update({
              where: { id: conflict.id },
              data: { candidateEntryIds: toJson(next.candidateIds) },
            });
          }
        }
        await clearAllDraftDeviceReady(tx, input.draftId);
        return { success: true as const, id: entry.id };
      }

      if (entry.status === "tombstoned") {
        return { success: true as const, id: entry.id };
      }

      await upsertOpenConflict(tx, {
        draftId: input.draftId,
        entityKey: entry.entityKey,
        type: "delete_request",
        candidateIds: [entry.id],
      });
      await clearAllDraftDeviceReady(tx, input.draftId);
      return { success: true as const, id: entry.id };
    }, COLLAB_TX_OPTIONS);
  } catch (error) {
    console.error("删除协作记录失败:", error);
    return { success: false, error: errorMessage(error) };
  }
}
