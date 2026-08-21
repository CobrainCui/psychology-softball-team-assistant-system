"use server";

import { prisma } from "@/lib/db";
import { errorMessage, type ActionResult } from "@/lib/actionResult";
import { writeAuditLog } from "@/lib/auth/audit";
import {
  requireScheduleManager,
  requireScheduleViewer,
} from "@/lib/auth/actionGuard";
import {
  RECORD_UPDATED_ERROR,
  scoresAgreeWithResult,
} from "@/lib/season/invariants";
import type { GameSummaryDto } from "@/lib/season/types";

function toDto(row: {
  id: string;
  status: GameSummaryDto["status"];
  ourScore: number | null;
  opponentScore: number | null;
  result: GameSummaryDto["result"];
  source: GameSummaryDto["source"];
  sourceFileId: string | null;
  version: number;
  note: string | null;
  confirmedAt: Date | null;
  lines: { playerId: string; participated: boolean }[];
}): GameSummaryDto {
  return {
    id: row.id,
    status: row.status,
    ourScore: row.ourScore,
    opponentScore: row.opponentScore,
    result: row.result,
    source: row.source,
    sourceFileId: row.sourceFileId,
    version: row.version,
    note: row.note,
    confirmedAt: row.confirmedAt?.toISOString() ?? null,
    lines: row.lines,
  };
}

export async function getCurrentGameSummary(
  eventId: string
): Promise<ActionResult<{ summary: GameSummaryDto | null }>> {
  try {
    const gate = await requireScheduleViewer();
    if (!gate.success) return gate;
    const row = await prisma.confirmedGameSummary.findFirst({
      where: {
        scheduleEventId: eventId,
        teamId: gate.ctx.teamId,
        status: "confirmed",
        supersededAt: null,
      },
      include: { lines: true },
    });
    return { success: true, summary: row ? toDto(row) : null };
  } catch (error) {
    console.error("读取比赛摘要失败:", error);
    return { success: false, error: errorMessage(error) };
  }
}

async function assertSourceFile(
  teamId: string,
  eventId: string,
  sourceFileId: string | null
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!sourceFileId) return { ok: true };
  const file = await prisma.gameRecordFile.findFirst({
    where: { id: sourceFileId, teamId },
  });
  if (!file) return { ok: false, error: "源文件不存在" };
  if (file.scheduleEventId !== eventId) {
    return { ok: false, error: "源文件不属于本场事件" };
  }
  if (file.status !== "ready" || file.deletedAt) {
    return { ok: false, error: "源文件未就绪或已删除" };
  }
  return { ok: true };
}

export async function confirmGameSummary(input: {
  eventId: string;
  ourScore: number | null;
  opponentScore: number | null;
  result: GameSummaryDto["result"];
  source?: GameSummaryDto["source"];
  sourceFileId?: string | null;
  note?: string;
  lines: { playerId: string; participated: boolean }[];
}): Promise<ActionResult<{ summary: GameSummaryDto }>> {
  try {
    const gate = await requireScheduleManager();
    if (!gate.success) return gate;
    const agree = scoresAgreeWithResult(
      input.ourScore,
      input.opponentScore,
      input.result
    );
    if (!agree.ok) return { success: false, error: agree.error };
    const sourceCheck = await assertSourceFile(
      gate.ctx.teamId,
      input.eventId,
      input.sourceFileId ?? null
    );
    if (!sourceCheck.ok) return { success: false, error: sourceCheck.error };

    const event = await prisma.scheduleEvent.findFirst({
      where: { id: input.eventId, teamId: gate.ctx.teamId },
    });
    if (!event) return { success: false, error: "事件不存在" };

    const playerIds = input.lines.map((l) => l.playerId);
    if (playerIds.length > 0) {
      const roster = await prisma.player.findMany({
        where: { teamId: gate.ctx.teamId, id: { in: playerIds } },
        select: { id: true },
      });
      if (roster.length !== new Set(playerIds).size) {
        return { success: false, error: "参赛名单含非本队队员" };
      }
    }

    try {
      const saved = await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`
          SELECT id FROM "ScheduleEvent" WHERE id = ${event.id} FOR UPDATE
        `;
        const current = await tx.confirmedGameSummary.findFirst({
          where: {
            scheduleEventId: event.id,
            status: "confirmed",
            supersededAt: null,
          },
        });
        if (current) {
          const moved = await tx.confirmedGameSummary.updateMany({
            where: {
              id: current.id,
              status: "confirmed",
              supersededAt: null,
            },
            data: { supersededAt: new Date() },
          });
          if (moved.count !== 1) throw new Error(RECORD_UPDATED_ERROR);
        }
        const nextVersion = (current?.version ?? 0) + 1;
        return tx.confirmedGameSummary.create({
          data: {
            teamId: gate.ctx.teamId,
            scheduleEventId: event.id,
            status: "confirmed",
            ourScore: input.ourScore,
            opponentScore: input.opponentScore,
            result: input.result,
            source: input.source ?? "manual",
            sourceFileId: input.sourceFileId ?? null,
            confirmedById: gate.ctx.accountId,
            confirmedAt: new Date(),
            version: nextVersion,
            note: input.note?.trim() || null,
            lines: {
              create: input.lines.map((line) => ({
                playerId: line.playerId,
                participated: line.participated,
              })),
            },
          },
          include: { lines: true },
        });
      });
      await writeAuditLog({
        action: "game_summary_confirmed",
        actorAccountId: gate.ctx.accountId,
        targetId: saved.id,
        metadata: { eventId: event.id, version: saved.version },
      });
      return { success: true, summary: toDto(saved) };
    } catch (error) {
      const msg = errorMessage(error);
      if (msg.includes("ConfirmedGameSummary_current_confirmed")) {
        return { success: false, error: RECORD_UPDATED_ERROR };
      }
      throw error;
    }
  } catch (error) {
    console.error("确认比赛摘要失败:", error);
    return { success: false, error: errorMessage(error) };
  }
}
