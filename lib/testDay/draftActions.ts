"use server";

import { prisma } from "@/lib/db";
import { errorMessage, type ActionResult } from "@/lib/actionResult";
import { formatDateOnly, parseDateOnly } from "@/lib/dateOnly";
import {
  requireTestDayDraftCreator,
  requireTestDayDraftJoiner,
} from "@/lib/auth/actionGuard";
import {
  canMutateTestDayDraftStructure,
} from "@/lib/auth/policy";
import { zonedDateStr } from "@/lib/season/timeZone";
import {
  DEFAULT_TEST_ITEMS,
  ensureRoleAssignmentItems,
  parseAssignmentLog,
  parseAssignments,
  type Assignments,
} from "@/lib/sessionDraft";
import {
  defsOnlyCustomTests,
  emptyCustomTestSlice,
  parseCustomTestSlice,
} from "@/lib/testDay/customTests";
import { createDefaultSpeedColumns } from "@/lib/testDay/speedGrid";
import { Prisma } from "@/lib/generated/prisma/client";
import {
  buildDraftDto,
  type TestDayDraftDto,
  type TestDayDraftListItem,
} from "@/lib/testDay/collab/dto";
import type { AssignmentCommit } from "@/lib/testDay/assignmentLog";

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

const draftSelect = {
  id: true,
  date: true,
  status: true,
  version: true,
  createdByAccountId: true,
  testItems: true,
  assignments: true,
  customTests: true,
  skillStructure: true,
  assignmentLog: true,
} as const;

export async function createTestDayDraft(
  dateStr?: string
): Promise<ActionResult<{ id: string }>> {
  try {
    const gate = await requireTestDayDraftCreator();
    if (!gate.success) return gate;

    const team = await prisma.team.findUnique({
      where: { id: gate.ctx.teamId },
      select: { timeZone: true },
    });
    const date = parseDateOnly(
      dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)
        ? dateStr
        : zonedDateStr(new Date(), team?.timeZone ?? "Asia/Shanghai")
    );

    const created = await prisma.testDayDraft.create({
      data: {
        teamId: gate.ctx.teamId,
        date,
        createdByAccountId: gate.ctx.accountId,
        testItems: toJson([...DEFAULT_TEST_ITEMS]),
        assignments: toJson({}),
        customTests: toJson(emptyCustomTestSlice()),
        skillStructure: toJson({
          speedColumns: createDefaultSpeedColumns(),
          strikeJudgeColumns: [],
        }),
        assignmentLog: toJson([]),
        members: {
          create: { accountId: gate.ctx.accountId },
        },
      },
      select: { id: true },
    });
    return { success: true, id: created.id };
  } catch (error) {
    console.error("创建协作测试日失败:", error);
    return { success: false, error: errorMessage(error) };
  }
}

export async function listOpenTestDayDrafts(): Promise<
  ActionResult<{ drafts: TestDayDraftListItem[] }>
> {
  try {
    const gate = await requireTestDayDraftJoiner();
    if (!gate.success) return gate;

    const rows = await prisma.testDayDraft.findMany({
      where: {
        teamId: gate.ctx.teamId,
        status: { in: ["open", "frozen"] },
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        date: true,
        status: true,
        version: true,
        createdByAccountId: true,
        members: { select: { accountId: true } },
      },
    });

    return {
      success: true,
      drafts: rows.map((row) => ({
        id: row.id,
        date: formatDateOnly(row.date),
        status: row.status,
        version: row.version,
        createdByAccountId: row.createdByAccountId,
        memberCount: row.members.length,
        isMember: row.members.some((m) => m.accountId === gate.ctx.accountId),
      })),
    };
  } catch (error) {
    console.error("列出协作测试日失败:", error);
    return { success: false, error: errorMessage(error) };
  }
}

export async function joinTestDayDraft(
  draftId: string
): Promise<ActionResult<{ id: string }>> {
  try {
    const gate = await requireTestDayDraftJoiner();
    if (!gate.success) return gate;

    const draft = await prisma.testDayDraft.findUnique({
      where: { id: draftId },
      select: { id: true, teamId: true, status: true },
    });
    if (!draft || draft.teamId !== gate.ctx.teamId) {
      return { success: false, error: "场次不存在" };
    }
    if (draft.status !== "open") {
      return { success: false, error: "该场次已冻结或归档，无法加入" };
    }

    await prisma.testDayDraftMember.upsert({
      where: {
        draftId_accountId: {
          draftId,
          accountId: gate.ctx.accountId,
        },
      },
      create: { draftId, accountId: gate.ctx.accountId },
      update: {},
    });
    return { success: true, id: draftId };
  } catch (error) {
    console.error("加入协作测试日失败:", error);
    return { success: false, error: errorMessage(error) };
  }
}

export async function getTestDayDraft(
  draftId: string
): Promise<ActionResult<{ draft: TestDayDraftDto }>> {
  try {
    const gate = await requireTestDayDraftJoiner();
    if (!gate.success) return gate;

    const loaded = await prisma.testDayDraft.findUnique({
      where: { id: draftId },
      select: {
        ...draftSelect,
        teamId: true,
        members: { select: { accountId: true } },
        entries: true,
        conflicts: true,
      },
    });
    if (!loaded || loaded.teamId !== gate.ctx.teamId) {
      return { success: false, error: "场次不存在" };
    }

    return {
      success: true,
      draft: buildDraftDto({
        draft: loaded,
        entries: loaded.entries,
        conflicts: loaded.conflicts,
        accountId: gate.ctx.accountId,
        canMutateStructure: canMutateTestDayDraftStructure(
          gate.ctx,
          loaded.createdByAccountId
        ),
        isMember: loaded.members.some(
          (row) => row.accountId === gate.ctx.accountId
        ),
      }),
    };
  } catch (error) {
    console.error("读取协作测试日失败:", error);
    return { success: false, error: errorMessage(error) };
  }
}

export async function freezeTestDayDraft(
  draftId: string
): Promise<ActionResult<{ id: string }>> {
  try {
    const gate = await requireTestDayDraftJoiner();
    if (!gate.success) return gate;

    const draft = await prisma.testDayDraft.findUnique({
      where: { id: draftId },
      select: { teamId: true, status: true, createdByAccountId: true },
    });
    if (!draft || draft.teamId !== gate.ctx.teamId) {
      return { success: false, error: "场次不存在" };
    }
    if (draft.status === "archived") {
      return { success: false, error: "场次已归档" };
    }
    if (!canMutateTestDayDraftStructure(gate.ctx, draft.createdByAccountId)) {
      return { success: false, error: "仅创建人或队长/教练可冻结" };
    }

    await prisma.testDayDraft.update({
      where: { id: draftId },
      data: { status: "frozen", frozenAt: new Date() },
    });
    return { success: true, id: draftId };
  } catch (error) {
    console.error("冻结协作测试日失败:", error);
    return { success: false, error: errorMessage(error) };
  }
}

export async function updateTestDayDraftStructure(
  draftId: string,
  patch: {
    testItems?: string[];
    assignments?: Assignments;
    assignmentLog?: AssignmentCommit[];
    customTests?: unknown;
    skillStructure?: unknown;
  }
): Promise<ActionResult<{ version: number }>> {
  try {
    const gate = await requireTestDayDraftJoiner();
    if (!gate.success) return gate;

    const draft = await prisma.testDayDraft.findUnique({
      where: { id: draftId },
      select: {
        teamId: true,
        status: true,
        createdByAccountId: true,
        version: true,
      },
    });
    if (!draft || draft.teamId !== gate.ctx.teamId) {
      return { success: false, error: "场次不存在" };
    }
    if (draft.status !== "open") {
      return { success: false, error: "冻结或归档后不能改结构" };
    }
    if (!canMutateTestDayDraftStructure(gate.ctx, draft.createdByAccountId)) {
      return { success: false, error: "仅创建人或队长/教练可改排阵与测试项" };
    }

    const data: Prisma.TestDayDraftUpdateInput = {
      version: { increment: 1 },
    };
    if (patch.testItems) {
      data.testItems = toJson(ensureRoleAssignmentItems(patch.testItems));
    }
    if (patch.assignments) {
      data.assignments = toJson(parseAssignments(patch.assignments));
    }
    if (patch.assignmentLog) {
      data.assignmentLog = toJson(parseAssignmentLog(patch.assignmentLog));
    }
    if (patch.customTests !== undefined) {
      data.customTests = toJson(
        defsOnlyCustomTests(parseCustomTestSlice(patch.customTests))
      );
    }
    if (patch.skillStructure !== undefined) {
      data.skillStructure = toJson(patch.skillStructure);
    }

    const updated = await prisma.testDayDraft.update({
      where: { id: draftId },
      data,
      select: { version: true },
    });
    return { success: true, version: updated.version };
  } catch (error) {
    console.error("更新协作结构失败:", error);
    return { success: false, error: errorMessage(error) };
  }
}
