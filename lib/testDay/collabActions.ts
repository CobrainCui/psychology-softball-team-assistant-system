"use server";

import { prisma } from "@/lib/db";
import { errorMessage, type ActionResult } from "@/lib/actionResult";
import { requireArchiver, requireTestDayDraftJoiner } from "@/lib/auth/actionGuard";
import { canMutateTestDayDraftStructure } from "@/lib/auth/policy";
import { Prisma } from "@/lib/generated/prisma/client";
import { buildClientArchivePayload } from "@/lib/testDay/archiveValidation";
import { buildTestSessionCreateInput } from "@/lib/testDay/sessionArchiveWrite";
import { canArchiveDraft, parseCandidateIds } from "@/lib/testDay/collab/merge";
import { toStoredConflict, toStoredEntry } from "@/lib/testDay/collab/dto";
import { projectDraftSnapshot } from "@/lib/testDay/collab/projectSnapshot";

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export async function resolveTestDayConflict(input: {
  draftId: string;
  conflictId: string;
  decision: "pick" | "manual" | "dismiss";
  entryId?: string;
  finalPayload?: unknown;
}): Promise<ActionResult<{ id: string }>> {
  try {
    const gate = await requireTestDayDraftJoiner();
    if (!gate.success) return gate;

    const conflict = await prisma.testDayConflict.findUnique({
      where: { id: input.conflictId },
      select: {
        id: true,
        draftId: true,
        entityKey: true,
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
      return { success: false, error: "冲突不存在" };
    }
    if (conflict.draft.teamId !== gate.ctx.teamId) {
      return { success: false, error: "场次不存在" };
    }
    if (conflict.draft.status === "archived") {
      return { success: false, error: "草稿已归档" };
    }
    if (!canMutateTestDayDraftStructure(gate.ctx, conflict.draft.createdByAccountId)) {
      return { success: false, error: "仅队长/教练可裁决冲突" };
    }
    if (conflict.reviewStatus !== "open") {
      return { success: false, error: "该冲突已处理" };
    }

    if (input.decision === "dismiss") {
      await prisma.testDayConflict.update({
        where: { id: conflict.id },
        data: {
          reviewStatus: "dismissed",
          resolvedByAccountId: gate.ctx.accountId,
          resolvedAt: new Date(),
        },
      });
      return { success: true, id: conflict.id };
    }

    let finalPayload = input.finalPayload ?? null;
    if (input.decision === "pick") {
      if (!input.entryId) return { success: false, error: "请选择一条候选" };
      const entry = await prisma.testDayEntry.findUnique({
        where: { id: input.entryId },
        select: { id: true, payload: true, draftId: true },
      });
      if (!entry || entry.draftId !== input.draftId) {
        return { success: false, error: "候选记录不存在" };
      }
      finalPayload = entry.payload;
    }
    if (finalPayload == null) {
      return { success: false, error: "请提供最终值" };
    }

    const candidateIds = parseCandidateIds(conflict.candidateEntryIds);
    await prisma.$transaction(async (tx) => {
      await tx.testDayConflict.update({
        where: { id: conflict.id },
        data: {
          reviewStatus: "resolved",
          finalPayload: toJson(finalPayload),
          resolvedByAccountId: gate.ctx.accountId,
          resolvedAt: new Date(),
        },
      });
      if (input.entryId) {
        await tx.testDayEntry.updateMany({
          where: {
            id: { in: candidateIds.filter((id) => id !== input.entryId) },
            draftId: input.draftId,
          },
          data: { status: "tombstoned" },
        });
      }
    });
    return { success: true, id: conflict.id };
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

    const draft = await prisma.testDayDraft.findUnique({
      where: { id: draftId },
      include: { entries: true, conflicts: true },
    });
    if (!draft || draft.teamId !== gate.ctx.teamId) {
      return { success: false, error: "场次不存在" };
    }
    if (draft.status === "archived") {
      return { success: false, error: "草稿已归档" };
    }

    const conflicts = draft.conflicts.map(toStoredConflict);
    if (!canArchiveDraft(conflicts)) {
      return { success: false, error: "仍有未裁决冲突，不能归档" };
    }

    const snapshot = projectDraftSnapshot({
      testItems: draft.testItems,
      assignments: draft.assignments,
      customTests: draft.customTests,
      skillStructure: draft.skillStructure,
      assignmentLog: draft.assignmentLog,
      entries: draft.entries.map(toStoredEntry),
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

    const archivedAt = new Date();
    const prismaData = buildTestSessionCreateInput(
      payload,
      gate.ctx.teamId,
      archivedAt
    );

    const session = await prisma.$transaction(async (tx) => {
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
      return created;
    });

    return { success: true, sessionId: session.id };
  } catch (error) {
    console.error("归档协作测试日失败:", error);
    return { success: false, error: errorMessage(error) };
  }
}
