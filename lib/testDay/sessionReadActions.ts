"use server";

import { prisma } from "@/lib/db";
import { errorMessage, type ActionResult } from "@/lib/actionResult";
import { requireApprovedSession } from "@/lib/auth/actionGuard";
import { sessionAttributionDate } from "@/lib/season/window";
import {
  sessionArchiveInclude,
  sessionToGameArchive,
} from "@/lib/sessionMapper";
import type { GameArchive } from "@/lib/gameArchive";

export type ArchivedSessionListItem = {
  id: string;
  date: string;
  sourceDraftId: string | null;
};

export type ArchivedSessionDetailDto = {
  id: string;
  date: string;
  sourceDraftId: string | null;
  archive: GameArchive;
  playerNames: Record<string, string>;
};

export async function listArchivedTestSessions(): Promise<
  ActionResult<{ sessions: ArchivedSessionListItem[] }>
> {
  try {
    const gate = await requireApprovedSession();
    if (!gate.success) return gate;

    const rows = await prisma.testSession.findMany({
      where: { teamId: gate.ctx.teamId },
      orderBy: { archivedAt: "desc" },
      take: 40,
      select: { id: true, archivedAt: true, sourceDraftId: true },
    });

    return {
      success: true,
      sessions: rows.map((row) => ({
        id: row.id,
        date: sessionAttributionDate(row.archivedAt, gate.ctx.teamTimeZone),
        sourceDraftId: row.sourceDraftId,
      })),
    };
  } catch (error) {
    console.error("列出归档测试日失败:", error);
    return { success: false, error: errorMessage(error) };
  }
}

export async function getArchivedTestSession(
  sessionId: string
): Promise<ActionResult<{ session: ArchivedSessionDetailDto }>> {
  try {
    const gate = await requireApprovedSession();
    if (!gate.success) return gate;

    const row = await prisma.testSession.findUnique({
      where: { id: sessionId },
      include: sessionArchiveInclude,
    });
    if (!row || row.teamId !== gate.ctx.teamId) {
      return { success: false, error: "场次不存在" };
    }

    const archive = sessionToGameArchive(row, gate.ctx.teamTimeZone);
    const roster = await prisma.player.findMany({
      where: { teamId: gate.ctx.teamId },
      select: { id: true, name: true },
    });
    const playerNames: Record<string, string> = {};
    for (const player of roster) {
      playerNames[player.id] = player.name;
    }

    return {
      success: true,
      session: {
        id: row.id,
        date: sessionAttributionDate(row.archivedAt, gate.ctx.teamTimeZone),
        sourceDraftId: row.sourceDraftId,
        archive,
        playerNames,
      },
    };
  } catch (error) {
    console.error("读取归档测试日失败:", error);
    return { success: false, error: errorMessage(error) };
  }
}

export async function getArchivedSessionByDraftId(
  draftId: string
): Promise<ActionResult<{ sessionId: string }>> {
  try {
    const gate = await requireApprovedSession();
    if (!gate.success) return gate;

    const row = await prisma.testSession.findFirst({
      where: { teamId: gate.ctx.teamId, sourceDraftId: draftId },
      select: { id: true },
    });
    if (!row) return { success: false, error: "尚无对应正式成绩" };

    return { success: true, sessionId: row.id };
  } catch (error) {
    console.error("按草稿查找归档测试日失败:", error);
    return { success: false, error: errorMessage(error) };
  }
}
