"use server";

import { prisma } from "@/lib/db";
import { formatDateOnly, parseDateOnly } from "@/lib/dateOnly";
import { normalizeActivityTypes } from "@/lib/clinical/activityTypes";
import {
  buildPostSaveFeedback,
  type PostSaveFeedbackView,
  type PostSessionRow,
} from "@/lib/clinical/postSaveFeedback";
import { SESSION_FEEDBACK_SCHEMA_VERSION } from "@/lib/sessionFeedback";
import type { ActionResult } from "@/lib/actionResult";
import { clampScore0to10, errorMessage, rejectIfNotToday } from "@/lib/status/shared";
import { requireOwnDataWriter } from "@/lib/auth/actionGuard";

export type SaveSessionFeedbackPayload = {
  date: string;
  activityTypes: string[];
  sessionRpe: number;
  note: string | null;
};

export type SessionFeedbackSaved = {
  id: string;
  date: string;
  activityTypes: string[];
  sessionRpe: number;
  note: string | null;
};

function mapSessionFeedbackSaved(row: {
  id: string;
  date: Date;
  activityTypes: string[];
  sessionRpe: number;
  note: string | null;
}): SessionFeedbackSaved {
  return {
    id: row.id,
    date: formatDateOnly(row.date),
    activityTypes: row.activityTypes,
    sessionRpe: row.sessionRpe,
    note: row.note,
  };
}

async function buildFeedbackViewForSaved(
  playerId: string,
  savedId: string
): Promise<PostSaveFeedbackView | null> {
  const [allPosts, activeCases] = await Promise.all([
    prisma.sessionFeedback.findMany({
      where: { playerId },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        date: true,
        activityTypes: true,
        sessionRpe: true,
      },
    }),
    prisma.injuryCase.findMany({
      where: { playerId, status: "active" },
      select: { painArea: true },
    }),
  ]);
  const postRows: PostSessionRow[] = allPosts.map((row) => ({
    id: row.id,
    date: formatDateOnly(row.date),
    activityTypes: row.activityTypes,
    sessionRpe: row.sessionRpe,
  }));
  const savedPost = postRows.find((p) => p.id === savedId);
  if (!savedPost) return null;
  return buildPostSaveFeedback({
    savedPost,
    activeInjuries: activeCases,
  });
}

export async function saveSessionFeedback(
  payload: SaveSessionFeedbackPayload
): Promise<
  ActionResult<{
    entry: SessionFeedbackSaved;
    view: PostSaveFeedbackView;
  }>
> {
  try {
    const gate = await requireOwnDataWriter();
    if (!gate.success) return gate;
    const playerId = gate.playerId;
    const dayErr = rejectIfNotToday(payload.date);
    if (dayErr) return dayErr;
    const sessionRpe = clampScore0to10(payload.sessionRpe);
    if (sessionRpe === null || sessionRpe < 1) {
      return { success: false, error: "sessionRpe 须为 1–10" };
    }
    const typesRes = normalizeActivityTypes(payload.activityTypes);
    if (!typesRes.success) return typesRes;
    const noteRaw = typeof payload.note === "string" ? payload.note.trim() : "";
    const note = noteRaw ? noteRaw.slice(0, 200) : null;

    const player = await prisma.player.findUnique({
      where: { id: playerId },
      select: { id: true },
    });
    if (!player) return { success: false, error: "云端无此队员" };

    const date = parseDateOnly(payload.date);
    const created = await prisma.sessionFeedback.create({
      data: {
        player: { connect: { id: player.id } },
        date,
        schemaVersion: SESSION_FEEDBACK_SCHEMA_VERSION,
        activityTypes: typesRes.types,
        sessionRpe,
        durationMin: null,
        sessionLoad: sessionRpe,
        note,
      },
    });

    const view = await buildFeedbackViewForSaved(
      player.id,
      created.id
    );
    if (!view) return { success: false, error: "写入后读取失败" };

    return {
      success: true,
      entry: mapSessionFeedbackSaved(created),
      view,
    };
  } catch (error) {
    console.error("数据库写入失败的完整原因:", error);
    return { success: false, error: errorMessage(error) };
  }
}

export async function getSessionFeedbacks(
  date: string
): Promise<ActionResult<{ entries: SessionFeedbackSaved[] }>> {
  try {
    const gate = await requireOwnDataWriter();
    if (!gate.success) return gate;
    const playerId = gate.playerId;
    if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return { success: false, error: "date 须为 YYYY-MM-DD" };
    }
    const rows = await prisma.sessionFeedback.findMany({
      where: { playerId, date: parseDateOnly(date) },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        date: true,
        activityTypes: true,
        sessionRpe: true,
        note: true,
      },
    });
    return { success: true, entries: rows.map(mapSessionFeedbackSaved) };
  } catch (error) {
    console.error("数据库写入失败的完整原因:", error);
    return { success: false, error: errorMessage(error) };
  }
}

export async function updateSessionFeedback(
  payload: SaveSessionFeedbackPayload & { id: string }
): Promise<
  ActionResult<{
    entry: SessionFeedbackSaved;
    view: PostSaveFeedbackView;
  }>
> {
  try {
    const gate = await requireOwnDataWriter();
    if (!gate.success) return gate;
    const playerId = gate.playerId;
    if (typeof payload.id !== "string" || !payload.id.trim()) {
      return { success: false, error: "id 无效" };
    }
    const dayErr = rejectIfNotToday(payload.date);
    if (dayErr) return dayErr;
    const sessionRpe = clampScore0to10(payload.sessionRpe);
    if (sessionRpe === null || sessionRpe < 1) {
      return { success: false, error: "sessionRpe 须为 1–10" };
    }
    const typesRes = normalizeActivityTypes(payload.activityTypes);
    if (!typesRes.success) return typesRes;
    const existing = await prisma.sessionFeedback.findFirst({
      where: { id: payload.id, playerId },
      select: { id: true, date: true },
    });
    if (!existing) return { success: false, error: "找不到该训后反馈" };
    const existingDate = formatDateOnly(existing.date);
    const existingDayErr = rejectIfNotToday(existingDate);
    if (existingDayErr) return existingDayErr;

    const noteRaw = typeof payload.note === "string" ? payload.note.trim() : "";
    const note = noteRaw ? noteRaw.slice(0, 200) : null;

    const updated = await prisma.sessionFeedback.update({
      where: { id: existing.id },
      data: {
        activityTypes: typesRes.types,
        sessionRpe,
        durationMin: null,
        sessionLoad: sessionRpe,
        note,
        schemaVersion: SESSION_FEEDBACK_SCHEMA_VERSION,
      },
      select: {
        id: true,
        date: true,
        activityTypes: true,
        sessionRpe: true,
        note: true,
      },
    });
    const view = await buildFeedbackViewForSaved(
      playerId,
      updated.id
    );
    if (!view) return { success: false, error: "写入后读取失败" };
    return {
      success: true,
      entry: mapSessionFeedbackSaved(updated),
      view,
    };
  } catch (error) {
    console.error("数据库写入失败的完整原因:", error);
    return { success: false, error: errorMessage(error) };
  }
}

export async function deleteSessionFeedback(payload: {
  id: string;
}): Promise<ActionResult> {
  try {
    const gate = await requireOwnDataWriter();
    if (!gate.success) return gate;
    const playerId = gate.playerId;
    const existing = await prisma.sessionFeedback.findFirst({
      where: { id: payload.id, playerId },
      select: { id: true, date: true },
    });
    if (!existing) return { success: false, error: "找不到该训后反馈" };
    const dayErr = rejectIfNotToday(formatDateOnly(existing.date));
    if (dayErr) return dayErr;
    await prisma.sessionFeedback.delete({ where: { id: existing.id } });
    return { success: true };
  } catch (error) {
    console.error("数据库写入失败的完整原因:", error);
    return { success: false, error: errorMessage(error) };
  }
}
