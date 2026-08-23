"use server";

import { prisma } from "@/lib/db";
import { errorMessage, type ActionResult } from "@/lib/actionResult";
import { requireTestDayDraftJoiner } from "@/lib/auth/actionGuard";
import { Prisma } from "@/lib/generated/prisma/client";
import { decideEntryMerge, parseCandidateIds } from "@/lib/testDay/collab/merge";
import { toStoredEntry } from "@/lib/testDay/collab/dto";
import { validateEntryPayload } from "@/lib/testDay/collab/validatePayload";
import type { TestDayEntryKind } from "@/lib/testDay/collab/types";

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export async function submitTestDayEntry(input: {
  draftId: string;
  kind: TestDayEntryKind;
  payload: unknown;
}): Promise<ActionResult<{ id: string; conflicted: boolean }>> {
  try {
    const gate = await requireTestDayDraftJoiner();
    if (!gate.success) return gate;

    const parsed = validateEntryPayload(input.kind, input.payload);
    if (!parsed.ok) return { success: false, error: parsed.error };

    const draft = await prisma.testDayDraft.findUnique({
      where: { id: input.draftId },
      select: {
        teamId: true,
        status: true,
        members: { select: { accountId: true } },
        entries: true,
      },
    });
    if (!draft || draft.teamId !== gate.ctx.teamId) {
      return { success: false, error: "场次不存在" };
    }
    if (draft.status === "archived") {
      return { success: false, error: "草稿已归档，不能继续提交" };
    }
    if (!draft.members.some((row) => row.accountId === gate.ctx.accountId)) {
      return { success: false, error: "请先加入该场次" };
    }

    const decision = decideEntryMerge({
      kind: input.kind,
      entityKey: parsed.entityKey,
      clientEntryId: parsed.clientEntryId,
      payload: input.payload,
      existing: draft.entries.map(toStoredEntry),
    });

    if (decision.action === "idempotent" || decision.action === "reuse_same_value") {
      return { success: true, id: decision.existing.id, conflicted: false };
    }

    let created: { id: string };
    try {
      created = await prisma.testDayEntry.create({
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
        const existing = await prisma.testDayEntry.findUnique({
          where: {
            draftId_clientEntryId: {
              draftId: input.draftId,
              clientEntryId: parsed.clientEntryId,
            },
          },
          select: { id: true },
        });
        if (existing) {
          return { success: true, id: existing.id, conflicted: false };
        }
      }
      throw error;
    }

    if (decision.action === "insert_and_conflict") {
      const candidateIds = [...decision.existingIds, created.id];
      const open = await prisma.testDayConflict.findFirst({
        where: {
          draftId: input.draftId,
          entityKey: parsed.entityKey,
          reviewStatus: "open",
        },
      });
      if (open) {
        const merged = [
          ...new Set([...parseCandidateIds(open.candidateEntryIds), ...candidateIds]),
        ];
        await prisma.testDayConflict.update({
          where: { id: open.id },
          data: { candidateEntryIds: toJson(merged) },
        });
      } else {
        await prisma.testDayConflict.create({
          data: {
            draftId: input.draftId,
            entityKey: parsed.entityKey,
            type: "value_mismatch",
            candidateEntryIds: toJson(candidateIds),
          },
        });
      }
      return { success: true, id: created.id, conflicted: true };
    }

    return { success: true, id: created.id, conflicted: false };
  } catch (error) {
    console.error("提交协作记录失败:", error);
    return { success: false, error: errorMessage(error) };
  }
}

export async function tombstoneTestDayEntry(input: {
  draftId: string;
  clientEntryId: string;
}): Promise<ActionResult<{ id: string }>> {
  try {
    const gate = await requireTestDayDraftJoiner();
    if (!gate.success) return gate;

    const entry = await prisma.testDayEntry.findUnique({
      where: {
        draftId_clientEntryId: {
          draftId: input.draftId,
          clientEntryId: input.clientEntryId,
        },
      },
      select: {
        id: true,
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
      return { success: false, error: "记录不存在" };
    }
    if (entry.draft.status === "archived") {
      return { success: false, error: "草稿已归档，不能删除" };
    }
    if (!entry.draft.members.some((row) => row.accountId === gate.ctx.accountId)) {
      return { success: false, error: "请先加入该场次" };
    }

    const openConflict = await prisma.testDayConflict.findFirst({
      where: {
        draftId: input.draftId,
        entityKey: entry.entityKey,
        reviewStatus: "open",
      },
    });

    if (entry.authorAccountId === gate.ctx.accountId && !openConflict) {
      await prisma.testDayEntry.update({
        where: { id: entry.id },
        data: { status: "tombstoned" },
      });
      return { success: true, id: entry.id };
    }

    await prisma.testDayConflict.create({
      data: {
        draftId: input.draftId,
        entityKey: entry.entityKey,
        type: "delete_request",
        candidateEntryIds: toJson([entry.id]),
      },
    });
    return { success: true, id: entry.id };
  } catch (error) {
    console.error("删除协作记录失败:", error);
    return { success: false, error: errorMessage(error) };
  }
}
