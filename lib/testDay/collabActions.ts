"use server";

import { prisma } from "@/lib/db";
import { errorMessage, type ActionResult } from "@/lib/actionResult";
import { formatDateOnly, ARCHIVE_SAME_DAY_ERROR } from "@/lib/dateOnly";
import { isWithinTestDayArchiveWindow } from "@/lib/season/timeZone";
import { requireArchiver, requireTestDayDraftJoiner } from "@/lib/auth/actionGuard";
import { canMutateTestDayDraftStructure } from "@/lib/auth/policy";
import { Prisma } from "@/lib/generated/prisma/client";
import {
  buildClientArchivePayload,
  sessionArchiveHasContent,
} from "@/lib/testDay/archiveValidation";
import { buildTestSessionCreateInput } from "@/lib/testDay/sessionArchiveWrite";
import { COLLAB_TX_OPTIONS, lockTestDayDraft } from "@/lib/testDay/collab/draftLock";
import { clearAllDraftDeviceReady } from "@/lib/testDay/collab/deviceGate";
import {
  assertConflictPickEntryId,
  canArchiveDraft,
  parseCandidateIds,
  resolveDeleteRequestDecision,
} from "@/lib/testDay/collab/merge";
import type {
  TestDayConflictDecision,
  TestDayEntryKind,
} from "@/lib/testDay/collab/types";
import { toStoredConflict, toStoredEntry } from "@/lib/testDay/collab/dto";
import { projectDraftSnapshot } from "@/lib/testDay/collab/projectSnapshot";
import { validateEntryPayload } from "@/lib/testDay/collab/validatePayload";
import {
  ARCHIVE_DEVICES_NOT_READY_ERROR,
  archiveDevicesReady,
} from "@/lib/testDay/collab/archiveReady";

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export async function resolveTestDayConflict(input: {
  draftId: string;
  conflictId: string;
  decision: TestDayConflictDecision;
  entryId?: string;
  finalPayload?: unknown;
}): Promise<ActionResult<{ id: string }>> {
  try {
    const gate = await requireTestDayDraftJoiner();
    if (!gate.success) return gate;

    return await prisma.$transaction(async (tx) => {
      await lockTestDayDraft(tx, input.draftId);
      const conflict = await tx.testDayConflict.findUnique({
        where: { id: input.conflictId },
        select: {
          id: true,
          draftId: true,
          entityKey: true,
          type: true,
          candidateEntryIds: true,
          reviewStatus: true,
          draft: {
            select: {
              teamId: true,
              status: true,
              createdByAccountId: true,
            },
          },
        },
      });
      if (!conflict || conflict.draftId !== input.draftId) {
        return { success: false as const, error: "冲突不存在" };
      }
      if (conflict.draft.teamId !== gate.ctx.teamId) {
        return { success: false as const, error: "场次不存在" };
      }
      if (conflict.draft.status === "archived") {
        return { success: false as const, error: "草稿已归档" };
      }
      if (!canMutateTestDayDraftStructure(gate.ctx, conflict.draft.createdByAccountId)) {
        return { success: false as const, error: "仅队长/教练可裁决冲突" };
      }
      if (conflict.reviewStatus !== "open") {
        return { success: false as const, error: "该冲突已处理" };
      }

      // 推导步骤：delete_request 只能批准墓碑候选或驳回保留；不得套用“采用候选”
      if (conflict.type === "delete_request") {
        const resolution = resolveDeleteRequestDecision(input.decision);
        if (resolution === "invalid") {
          return { success: false as const, error: "删除请求请批准删除或驳回删除" };
        }
        const candidateIds = parseCandidateIds(conflict.candidateEntryIds);
        if (resolution === "approve_delete") {
          await tx.testDayConflict.update({
            where: { id: conflict.id },
            data: {
              reviewStatus: "resolved",
              finalPayload: toJson({ deleted: true }),
              resolvedByAccountId: gate.ctx.accountId,
              resolvedAt: new Date(),
            },
          });
          if (candidateIds.length > 0) {
            await tx.testDayEntry.updateMany({
              where: { id: { in: candidateIds }, draftId: input.draftId },
              data: { status: "tombstoned" },
            });
          }
        } else {
          await tx.testDayConflict.update({
            where: { id: conflict.id },
            data: {
              reviewStatus: "dismissed",
              resolvedByAccountId: gate.ctx.accountId,
              resolvedAt: new Date(),
            },
          });
        }
        await clearAllDraftDeviceReady(tx, input.draftId);
        return { success: true as const, id: conflict.id };
      }

      if (
        input.decision === "approve_delete" ||
        input.decision === "reject_delete"
      ) {
        return { success: false as const, error: "该冲突不是删除请求" };
      }

      // 推导步骤：异值冲突驳回后投影会丢格，必须采用候选或手填合法最终值
      if (input.decision === "dismiss") {
        return {
          success: false as const,
          error: "数值冲突请采用一条候选，不能直接驳回",
        };
      }

      const candidateIds = parseCandidateIds(conflict.candidateEntryIds);
      let finalPayload = input.finalPayload ?? null;
      let tombstoneIds = candidateIds;

      if (input.decision === "pick") {
        const picked = assertConflictPickEntryId(candidateIds, input.entryId);
        if (!picked.ok) return { success: false as const, error: picked.error };
        const entry = await tx.testDayEntry.findUnique({
          where: { id: picked.entryId },
          select: { id: true, payload: true, draftId: true, entityKey: true },
        });
        if (
          !entry ||
          entry.draftId !== input.draftId ||
          entry.entityKey !== conflict.entityKey
        ) {
          return { success: false as const, error: "所选记录不是该冲突的候选" };
        }
        finalPayload = entry.payload;
        tombstoneIds = candidateIds.filter((id) => id !== picked.entryId);
      } else if (input.decision === "manual") {
        if (finalPayload == null) {
          return { success: false as const, error: "请提供最终值" };
        }
        const sampleId = candidateIds[0];
        if (!sampleId) return { success: false as const, error: "没有候选记录" };
        const sample = await tx.testDayEntry.findUnique({
          where: { id: sampleId },
          select: { kind: true, draftId: true },
        });
        if (!sample || sample.draftId !== input.draftId) {
          return { success: false as const, error: "候选记录不存在" };
        }
        const parsed = validateEntryPayload(
          sample.kind as TestDayEntryKind,
          finalPayload
        );
        if (!parsed.ok) return { success: false as const, error: parsed.error };
        if (parsed.entityKey !== conflict.entityKey) {
          return { success: false as const, error: "最终值不属于该格" };
        }
      } else {
        return { success: false as const, error: "请选择一条候选" };
      }

      if (finalPayload == null) {
        return { success: false as const, error: "请提供最终值" };
      }

      await tx.testDayConflict.update({
        where: { id: conflict.id },
        data: {
          reviewStatus: "resolved",
          finalPayload: toJson(finalPayload),
          resolvedByAccountId: gate.ctx.accountId,
          resolvedAt: new Date(),
        },
      });
      if (tombstoneIds.length > 0) {
        await tx.testDayEntry.updateMany({
          where: {
            id: { in: tombstoneIds },
            draftId: input.draftId,
          },
          data: { status: "tombstoned" },
        });
      }
      await clearAllDraftDeviceReady(tx, input.draftId);
      return { success: true as const, id: conflict.id };
    }, COLLAB_TX_OPTIONS);
  } catch (error) {
    console.error("裁决冲突失败:", error);
    return { success: false, error: errorMessage(error) };
  }
}

export async function archiveTestDayDraft(
  draftId: string
): Promise<ActionResult<{ sessionId: string }>> {
  try {
    const gate = await requireArchiver();
    if (!gate.success) return gate;

    return await prisma.$transaction(async (tx) => {
      await lockTestDayDraft(tx, draftId);
      const draft = await tx.testDayDraft.findUnique({
        where: { id: draftId },
        include: { entries: true, conflicts: true, members: true, devices: true },
      });
      if (!draft || draft.teamId !== gate.ctx.teamId) {
        return { success: false as const, error: "场次不存在" };
      }
      if (draft.status === "archived") {
        return { success: false as const, error: "草稿已归档" };
      }

      const draftDate = formatDateOnly(draft.date);
      if (
        !isWithinTestDayArchiveWindow(draftDate, gate.ctx.teamTimeZone)
      ) {
        return {
          success: false as const,
          error: ARCHIVE_SAME_DAY_ERROR,
        };
      }

      const conflicts = draft.conflicts.map(toStoredConflict);
      const entries = draft.entries.map(toStoredEntry);
      if (!canArchiveDraft(conflicts, entries)) {
        return {
          success: false as const,
          error: "仍有未裁决冲突或未选定最终值，不能归档",
        };
      }

      const snapshot = projectDraftSnapshot({
        testItems: draft.testItems,
        assignments: draft.assignments,
        customTests: draft.customTests,
        skillStructure: draft.skillStructure,
        assignmentLog: draft.assignmentLog,
        entries,
        conflicts,
      });

      const payload = buildClientArchivePayload({
        hits: snapshot.hits,
        speedColumns: snapshot.speedColumns,
        speedMarks: snapshot.speedMarks,
        flyCatchAttempts: snapshot.flyCatchAttempts,
        strikeJudgeColumns: snapshot.strikeJudgeColumns,
        strikeJudgeCells: snapshot.strikeJudgeCells,
        throwPlays: snapshot.throwPlays,
        assignments: snapshot.assignments,
        testItems: snapshot.testItems,
        assignmentLog: snapshot.assignmentLog,
        customTestDefs: snapshot.customTestDefs,
        customPlayerNotes: snapshot.customPlayerNotes,
        customGroupNotes: snapshot.customGroupNotes,
        customSingleNotes: snapshot.customSingleNotes,
      });

      if (!sessionArchiveHasContent(payload)) {
        return {
          success: false as const,
          error: "当前没有可归档的测试记录。",
        };
      }

      if (
        !archiveDevicesReady({
          members: draft.members,
          devices: draft.devices,
        })
      ) {
        return {
          success: false as const,
          error: ARCHIVE_DEVICES_NOT_READY_ERROR,
        };
      }

      const archivedAt = new Date();
      const prismaData = buildTestSessionCreateInput(
        payload,
        gate.ctx.teamId,
        archivedAt
      );
      const created = await tx.testSession.create({
        data: {
          ...prismaData,
          sourceDraftId: draft.id,
        },
        select: { id: true },
      });
      await tx.testDayDraft.update({
        where: { id: draft.id },
        data: { status: "archived" },
      });
      return { success: true as const, sessionId: created.id };
    }, COLLAB_TX_OPTIONS);
  } catch (error) {
    console.error("归档协作测试日失败:", error);
    return { success: false, error: errorMessage(error) };
  }
}
