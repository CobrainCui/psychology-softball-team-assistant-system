"use server";

import { prisma } from "@/lib/db";
import { formatDateOnly, parseDateOnly } from "@/lib/dateOnly";
import { getTeamTodayDateStr } from "@/lib/season/timeZone";
import type { PainArea } from "@/lib/clinical/painAreas";
import {
  isInjuryKind,
  isPainExerciseRelation,
  type InjuryKind,
  type InjuryNoteKind,
  type PainExerciseRelationId,
} from "@/lib/clinical/injuryKinds";
import type { ActionResult } from "@/lib/actionResult";
import {
  asPainArea,
  caseInclude,
  clampScore0to10,
  errorMessage,
  mapCase,
  rejectIfNotToday,
  type CaseRow,
  type InjuryCaseDto,
} from "@/lib/status/shared";
import { requireOwnDataWriter } from "@/lib/auth/actionGuard";

export async function getInjuryCases(): Promise<
  ActionResult<{ cases: InjuryCaseDto[] }>
> {
  try {
    const gate = await requireOwnDataWriter();
    if (!gate.success) return gate;
    const rows = await prisma.injuryCase.findMany({
      where: { playerId: gate.playerId },
      include: caseInclude,
      orderBy: { updatedAt: "desc" },
    });
    return { success: true, cases: rows.map((row) => mapCase(row as CaseRow)) };
  } catch (error) {
    console.error("数据库写入失败的完整原因:", error);
    return { success: false, error: errorMessage(error) };
  }
}

export type CreateInjuryCasePayload = {
  painArea: PainArea;
  locationHint?: string;
  injuryKind: InjuryKind;
  startDate: string;
  painScore: number;
  painExerciseRelations: PainExerciseRelationId[];
  note?: string | null;
  parentCaseId?: string | null;
};

export async function createInjuryCase(
  payload: CreateInjuryCasePayload
): Promise<ActionResult<{ injuryCase: InjuryCaseDto }>> {
  try {
    const gate = await requireOwnDataWriter();
    if (!gate.success) return gate;
    const playerId = gate.playerId;
    const painArea = asPainArea(payload.painArea);
    if (!painArea) return { success: false, error: "painArea 无效" };
    if (!isInjuryKind(payload.injuryKind)) {
      return { success: false, error: "injuryKind 无效" };
    }
    if (
      typeof payload.startDate !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(payload.startDate)
    ) {
      return { success: false, error: "startDate 须为 YYYY-MM-DD" };
    }
    const painScore = clampScore0to10(payload.painScore);
    if (painScore === null) return { success: false, error: "painScore 无效" };
    const dayErr = rejectIfNotToday(payload.startDate, gate.ctx.teamTimeZone);
    if (dayErr) return dayErr;

    const player = await prisma.player.findUnique({
      where: { id: playerId },
      select: { id: true },
    });
    if (!player) return { success: false, error: "云端无此队员" };

    const parentCaseId = payload.parentCaseId?.trim() || null;
    if (parentCaseId) {
      const parent = await prisma.injuryCase.findFirst({
        where: { id: parentCaseId, playerId },
        select: { id: true },
      });
      if (!parent) return { success: false, error: "复发须关联本人既有记录" };
    }

    const relations = (payload.painExerciseRelations ?? []).filter(
      isPainExerciseRelation
    );
    const startDate = parseDateOnly(payload.startDate);
    const row = await prisma.injuryCase.create({
      data: {
        player: { connect: { id: player.id } },
        schemaVersion: 2,
        painArea,
        locationHint: (payload.locationHint ?? "").trim().slice(0, 80),
        injuryKind: payload.injuryKind,
        status: "active",
        startDate,
        ...(parentCaseId
          ? { parent: { connect: { id: parentCaseId } } }
          : {}),
        painLogs: {
          create: {
            date: startDate,
            painScore,
            painExerciseRelations: relations,
            note: payload.note?.trim().slice(0, 200) || null,
          },
        },
      },
      include: caseInclude,
    });
    return { success: true, injuryCase: mapCase(row as CaseRow) };
  } catch (error) {
    console.error("数据库写入失败的完整原因:", error);
    return { success: false, error: errorMessage(error) };
  }
}

export type AddInjuryPainLogPayload = {
  caseId: string;
  date: string;
  painScore: number;
  painExerciseRelations: PainExerciseRelationId[];
  note?: string | null;
};

export async function addInjuryPainLog(
  payload: AddInjuryPainLogPayload
): Promise<ActionResult<{ injuryCase: InjuryCaseDto }>> {
  try {
    const gate = await requireOwnDataWriter();
    if (!gate.success) return gate;
    const playerId = gate.playerId;
    const painScore = clampScore0to10(payload.painScore);
    if (painScore === null) return { success: false, error: "painScore 无效" };
    const dayErr = rejectIfNotToday(payload.date, gate.ctx.teamTimeZone);
    if (dayErr) return dayErr;
    const existing = await prisma.injuryCase.findFirst({
      where: { id: payload.caseId, playerId: playerId },
    });
    if (!existing) return { success: false, error: "找不到该损伤记录" };
    if (existing.status !== "active") {
      return { success: false, error: "已康复记录请走复发" };
    }
    const date = parseDateOnly(payload.date);
    await prisma.injuryPainLog.create({
      data: {
        injuryCase: { connect: { id: existing.id } },
        date,
        painScore,
        painExerciseRelations: (payload.painExerciseRelations ?? []).filter(
          isPainExerciseRelation
        ),
        note: payload.note?.trim().slice(0, 200) || null,
      },
    });
    const row = await prisma.injuryCase.findUnique({
      where: { id: existing.id },
      include: caseInclude,
    });
    if (!row) return { success: false, error: "写入后读取失败" };
    return { success: true, injuryCase: mapCase(row as CaseRow) };
  } catch (error) {
    console.error("数据库写入失败的完整原因:", error);
    return { success: false, error: errorMessage(error) };
  }
}

export type AddInjuryNotePayload = {
  caseId: string;
  kind: InjuryNoteKind;
  date: string;
  content: string;
};

export async function addInjuryNote(
  payload: AddInjuryNotePayload
): Promise<ActionResult<{ injuryCase: InjuryCaseDto }>> {
  try {
    const gate = await requireOwnDataWriter();
    if (!gate.success) return gate;
    const playerId = gate.playerId;
    if (payload.kind !== "treatment" && payload.kind !== "rehab") {
      return { success: false, error: "kind 无效" };
    }
    const content = typeof payload.content === "string" ? payload.content.trim() : "";
    if (!content) return { success: false, error: "备注不能为空" };
    const dayErr = rejectIfNotToday(payload.date, gate.ctx.teamTimeZone);
    if (dayErr) return dayErr;
    const existing = await prisma.injuryCase.findFirst({
      where: { id: payload.caseId, playerId: playerId },
    });
    if (!existing) return { success: false, error: "找不到该损伤记录" };
    await prisma.injuryNoteRecord.create({
      data: {
        injuryCase: { connect: { id: existing.id } },
        kind: payload.kind,
        date: parseDateOnly(payload.date),
        content: content.slice(0, 500),
      },
    });
    const row = await prisma.injuryCase.findUnique({
      where: { id: existing.id },
      include: caseInclude,
    });
    if (!row) return { success: false, error: "写入后读取失败" };
    return { success: true, injuryCase: mapCase(row as CaseRow) };
  } catch (error) {
    console.error("数据库写入失败的完整原因:", error);
    return { success: false, error: errorMessage(error) };
  }
}

export async function markInjuryRecovered(payload: {
  caseId: string;
  recoveredAt?: string;
}): Promise<ActionResult<{ injuryCase: InjuryCaseDto }>> {
  try {
    const gate = await requireOwnDataWriter();
    if (!gate.success) return gate;
    const playerId = gate.playerId;
    const existing = await prisma.injuryCase.findFirst({
      where: { id: payload.caseId, playerId: playerId },
    });
    if (!existing) return { success: false, error: "找不到该损伤记录" };
    const recoveredAt =
      typeof payload.recoveredAt === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(payload.recoveredAt)
        ? parseDateOnly(payload.recoveredAt)
        : parseDateOnly(getTeamTodayDateStr(gate.ctx.teamTimeZone));
    const row = await prisma.injuryCase.update({
      where: { id: existing.id },
      data: { status: "recovered", recoveredAt },
      include: caseInclude,
    });
    return { success: true, injuryCase: mapCase(row as CaseRow) };
  } catch (error) {
    console.error("数据库写入失败的完整原因:", error);
    return { success: false, error: errorMessage(error) };
  }
}

export type UpdateInjuryCasePayload = {
  caseId: string;
  painArea: PainArea;
  locationHint?: string;
  injuryKind: InjuryKind;
};

export async function updateInjuryCase(
  payload: UpdateInjuryCasePayload
): Promise<ActionResult<{ injuryCase: InjuryCaseDto }>> {
  try {
    const gate = await requireOwnDataWriter();
    if (!gate.success) return gate;
    const playerId = gate.playerId;
    const existing = await prisma.injuryCase.findFirst({
      where: { id: payload.caseId, playerId: playerId },
    });
    if (!existing) return { success: false, error: "找不到该损伤记录" };
    const dayErr = rejectIfNotToday(formatDateOnly(existing.startDate), gate.ctx.teamTimeZone);
    if (dayErr) return dayErr;
    const painArea = asPainArea(payload.painArea);
    if (!painArea) return { success: false, error: "painArea 无效" };
    if (!isInjuryKind(payload.injuryKind)) {
      return { success: false, error: "injuryKind 无效" };
    }
    const locationHint =
      typeof payload.locationHint === "string"
        ? payload.locationHint.trim().slice(0, 80)
        : existing.locationHint;
    const row = await prisma.injuryCase.update({
      where: { id: existing.id },
      data: { painArea, locationHint, injuryKind: payload.injuryKind },
      include: caseInclude,
    });
    return { success: true, injuryCase: mapCase(row as CaseRow) };
  } catch (error) {
    console.error("数据库写入失败的完整原因:", error);
    return { success: false, error: errorMessage(error) };
  }
}

export async function deleteInjuryCase(payload: {
  caseId: string;
}): Promise<ActionResult> {
  try {
    const gate = await requireOwnDataWriter();
    if (!gate.success) return gate;
    const playerId = gate.playerId;
    const existing = await prisma.injuryCase.findFirst({
      where: { id: payload.caseId, playerId: playerId },
    });
    if (!existing) return { success: false, error: "找不到该损伤记录" };
    const dayErr = rejectIfNotToday(formatDateOnly(existing.startDate), gate.ctx.teamTimeZone);
    if (dayErr) return dayErr;
    await prisma.injuryCase.delete({ where: { id: existing.id } });
    return { success: true };
  } catch (error) {
    console.error("数据库写入失败的完整原因:", error);
    return { success: false, error: errorMessage(error) };
  }
}

export type UpdateInjuryPainLogPayload = {
  logId: string;
  painScore: number;
  painExerciseRelations: PainExerciseRelationId[];
  note?: string | null;
};

export async function updateInjuryPainLog(
  payload: UpdateInjuryPainLogPayload
): Promise<ActionResult<{ injuryCase: InjuryCaseDto }>> {
  try {
    const gate = await requireOwnDataWriter();
    if (!gate.success) return gate;
    const playerId = gate.playerId;
    const painScore = clampScore0to10(payload.painScore);
    if (painScore === null) return { success: false, error: "painScore 无效" };
    const log = await prisma.injuryPainLog.findUnique({
      where: { id: payload.logId },
      include: { injuryCase: true },
    });
    if (!log || log.injuryCase.playerId !== playerId) {
      return { success: false, error: "找不到该疼痛记录" };
    }
    const dayErr = rejectIfNotToday(formatDateOnly(log.date), gate.ctx.teamTimeZone);
    if (dayErr) return dayErr;
    await prisma.injuryPainLog.update({
      where: { id: log.id },
      data: {
        painScore,
        painExerciseRelations: (payload.painExerciseRelations ?? []).filter(
          isPainExerciseRelation
        ),
        note: payload.note?.trim().slice(0, 200) || null,
      },
    });
    const row = await prisma.injuryCase.findUnique({
      where: { id: log.caseId },
      include: caseInclude,
    });
    if (!row) return { success: false, error: "写入后读取失败" };
    return { success: true, injuryCase: mapCase(row as CaseRow) };
  } catch (error) {
    console.error("数据库写入失败的完整原因:", error);
    return { success: false, error: errorMessage(error) };
  }
}

export async function deleteInjuryPainLog(payload: {
  logId: string;
}): Promise<ActionResult<{ injuryCase: InjuryCaseDto }>> {
  try {
    const gate = await requireOwnDataWriter();
    if (!gate.success) return gate;
    const playerId = gate.playerId;
    const log = await prisma.injuryPainLog.findUnique({
      where: { id: payload.logId },
      include: { injuryCase: true },
    });
    if (!log || log.injuryCase.playerId !== playerId) {
      return { success: false, error: "找不到该疼痛记录" };
    }
    const dayErr = rejectIfNotToday(formatDateOnly(log.date), gate.ctx.teamTimeZone);
    if (dayErr) return dayErr;
    await prisma.injuryPainLog.delete({ where: { id: log.id } });
    const row = await prisma.injuryCase.findUnique({
      where: { id: log.caseId },
      include: caseInclude,
    });
    if (!row) return { success: false, error: "删除后读取失败" };
    return { success: true, injuryCase: mapCase(row as CaseRow) };
  } catch (error) {
    console.error("数据库写入失败的完整原因:", error);
    return { success: false, error: errorMessage(error) };
  }
}

export type UpdateInjuryNotePayload = {
  noteId: string;
  content: string;
};

export async function updateInjuryNote(
  payload: UpdateInjuryNotePayload
): Promise<ActionResult<{ injuryCase: InjuryCaseDto }>> {
  try {
    const gate = await requireOwnDataWriter();
    if (!gate.success) return gate;
    const playerId = gate.playerId;
    const content =
      typeof payload.content === "string" ? payload.content.trim() : "";
    if (!content) return { success: false, error: "备注不能为空" };
    const note = await prisma.injuryNoteRecord.findUnique({
      where: { id: payload.noteId },
      include: { injuryCase: true },
    });
    if (!note || note.injuryCase.playerId !== playerId) {
      return { success: false, error: "找不到该备注" };
    }
    const dayErr = rejectIfNotToday(formatDateOnly(note.date), gate.ctx.teamTimeZone);
    if (dayErr) return dayErr;
    await prisma.injuryNoteRecord.update({
      where: { id: note.id },
      data: { content: content.slice(0, 500) },
    });
    const row = await prisma.injuryCase.findUnique({
      where: { id: note.caseId },
      include: caseInclude,
    });
    if (!row) return { success: false, error: "写入后读取失败" };
    return { success: true, injuryCase: mapCase(row as CaseRow) };
  } catch (error) {
    console.error("数据库写入失败的完整原因:", error);
    return { success: false, error: errorMessage(error) };
  }
}

export async function deleteInjuryNote(payload: {
  noteId: string;
}): Promise<ActionResult<{ injuryCase: InjuryCaseDto }>> {
  try {
    const gate = await requireOwnDataWriter();
    if (!gate.success) return gate;
    const playerId = gate.playerId;
    const note = await prisma.injuryNoteRecord.findUnique({
      where: { id: payload.noteId },
      include: { injuryCase: true },
    });
    if (!note || note.injuryCase.playerId !== playerId) {
      return { success: false, error: "找不到该备注" };
    }
    const dayErr = rejectIfNotToday(formatDateOnly(note.date), gate.ctx.teamTimeZone);
    if (dayErr) return dayErr;
    await prisma.injuryNoteRecord.delete({ where: { id: note.id } });
    const row = await prisma.injuryCase.findUnique({
      where: { id: note.caseId },
      include: caseInclude,
    });
    if (!row) return { success: false, error: "删除后读取失败" };
    return { success: true, injuryCase: mapCase(row as CaseRow) };
  } catch (error) {
    console.error("数据库写入失败的完整原因:", error);
    return { success: false, error: errorMessage(error) };
  }
}
