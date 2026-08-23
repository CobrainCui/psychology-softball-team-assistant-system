"use server";

import { prisma } from "@/lib/db";
import { parseDateOnly } from "@/lib/dateOnly";
import { getTeamTodayDateStr } from "@/lib/season/timeZone";
import { QUADRANT_LABEL, type PreQuadrant } from "@/lib/clinical/preQuadrant";
import { formatActivityLabels } from "@/lib/clinical/activityTypes";
import {
  LOAD_TAG_COACH_HINT,
  LOAD_TAG_LABEL,
} from "@/lib/clinical/physiologicalLoad";
import type { ActionResult } from "@/lib/actionResult";
import { errorMessage, mapCase, type CaseRow } from "@/lib/status/shared";
import {
  requireHealthReader,
  requireTeamOpsReader,
} from "@/lib/auth/actionGuard";
import { findForbiddenCoachDtoKey } from "@/lib/auth/coachDtoGuard";

export type CoachPlotPoint = {
  playerId: string;
  playerName: string;
  physicalBattery: number;
  mentalDrive: number;
  quadrant: PreQuadrant;
  quadrantLabel: string;
};

export type CoachUncheckedRow = {
  playerId: string;
  playerName: string;
};

export type CoachInjuryRow = {
  playerId: string;
  playerName: string;
  painAreaLabel: string;
  latestPain: number | null;
  trendLabel: string;
};

export type CoachLoadNoteRow = {
  playerId: string;
  playerName: string;
  physiologicalLoadLabel: string;
  physiologicalLoadHint: string;
};

export type CoachSessionFeedbackRow = {
  id: string;
  playerId: string;
  playerName: string;
  activityLabel: string;
  sessionRpe: number;
};

export type CoachDaySummary = {
  date: string;
  plotted: CoachPlotPoint[];
  unchecked: CoachUncheckedRow[];
  watchList: CoachPlotPoint[];
  activeInjuries: CoachInjuryRow[];
  loadNotes: CoachLoadNoteRow[];
  sessionFeedbacks: CoachSessionFeedbackRow[];
  checkedInCount: number;
  rosterCount: number;
  uncheckedCount: number;
  feedbackCount: number;
};

export type TeamOpsRow = {
  playerId: string;
  playerName: string;
  readinessSubmitted: boolean;
  feedbackSubmitted: boolean;
};

export type TeamOpsSummary = {
  date: string;
  rows: TeamOpsRow[];
  rosterCount: number;
  readinessCount: number;
  feedbackCount: number;
};

/** 推导步骤：排除教练身份队员（AccountRole.coach 或遗留 Player.role） */
async function rosterPlayerIdsForHealth(teamId: string): Promise<{
  playerIds: string[];
  nameById: Map<string, string>;
}> {
  const roster = await prisma.player.findMany({
    where: { teamId },
    orderBy: { name: "asc" },
    select: { id: true, name: true, role: true },
  });

  const coachAccounts = await prisma.account.findMany({
    where: {
      teamId,
      roles: { some: { role: "coach" } },
      playerId: { not: null },
    },
    select: { playerId: true },
  });
  const coachPlayerIds = new Set(
    coachAccounts.map((a) => a.playerId!).filter(Boolean)
  );

  const playerIds = roster
    .filter((p) => p.role !== "coach" && !coachPlayerIds.has(p.id))
    .map((p) => p.id);

  return {
    playerIds,
    nameById: new Map(roster.map((p) => [p.id, p.name])),
  };
}

export async function getCoachDaySummary(
  dateStr?: string
): Promise<ActionResult<{ summary: CoachDaySummary }>> {
  try {
    const gate = await requireHealthReader();
    if (!gate.success) return gate;

    const date =
      typeof dateStr === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)
        ? dateStr
        : getTeamTodayDateStr(gate.ctx.teamTimeZone);

    const { playerIds, nameById } = await rosterPlayerIdsForHealth(
      gate.ctx.teamId
    );
    const day = parseDateOnly(date);
    const [checks, feedbackRows, profiles, caseRows] = await Promise.all([
      prisma.readinessCheck.findMany({
        where: { playerId: { in: playerIds }, date: day },
      }),
      prisma.sessionFeedback.findMany({
        where: { playerId: { in: playerIds }, date: day },
        orderBy: { sessionRpe: "desc" },
        select: {
          id: true,
          playerId: true,
          activityTypes: true,
          sessionRpe: true,
        },
      }),
      prisma.cycleProfile.findMany({
        where: { playerId: { in: playerIds } },
        select: { playerId: true, sharingLevel: true, trackingEnabled: true },
      }),
      prisma.injuryCase.findMany({
        where: { playerId: { in: playerIds }, status: "active" },
        include: { painLogs: true },
      }),
    ]);

    const checkByPlayer = new Map(checks.map((row) => [row.playerId, row]));
    const profileByPlayer = new Map(profiles.map((p) => [p.playerId, p]));

    const plotted: CoachPlotPoint[] = [];
    const unchecked: CoachUncheckedRow[] = [];
    const loadNotes: CoachLoadNoteRow[] = [];

    for (const id of playerIds) {
      const name = nameById.get(id) ?? "未知";
      const row = checkByPlayer.get(id);
      if (!row) {
        unchecked.push({ playerId: id, playerName: name });
        continue;
      }
      plotted.push({
        playerId: id,
        playerName: name,
        physicalBattery: row.physicalBattery,
        mentalDrive: row.mentalDrive,
        quadrant: row.quadrant,
        quadrantLabel: QUADRANT_LABEL[row.quadrant],
      });
      const profile = profileByPlayer.get(id);
      const canShare =
        profile?.trackingEnabled &&
        profile.sharingLevel !== "none" &&
        row.physiologicalLoadTag;
      if (canShare && row.physiologicalLoadTag) {
        loadNotes.push({
          playerId: id,
          playerName: name,
          physiologicalLoadLabel: LOAD_TAG_LABEL[row.physiologicalLoadTag],
          physiologicalLoadHint: LOAD_TAG_COACH_HINT[row.physiologicalLoadTag],
        });
      }
    }

    const watchList = plotted.filter(
      (p) => p.quadrant === "injury_risk" || p.quadrant === "real_fatigue"
    );

    const activeInjuries: CoachInjuryRow[] = caseRows.map((row) => {
      const dto = mapCase({
        ...row,
        notes: [],
        painLogs: row.painLogs,
      } as CaseRow);
      return {
        playerId: row.playerId,
        playerName: nameById.get(row.playerId) ?? "未知",
        painAreaLabel: dto.painAreaLabel,
        latestPain: dto.latestPain,
        trendLabel: dto.trend.label,
      };
    });

    const sessionFeedbacks: CoachSessionFeedbackRow[] = feedbackRows.map(
      (row) => ({
        id: row.id,
        playerId: row.playerId,
        playerName: nameById.get(row.playerId) ?? "未知",
        activityLabel: formatActivityLabels(row.activityTypes),
        sessionRpe: row.sessionRpe,
      })
    );

    const summary: CoachDaySummary = {
      date,
      plotted,
      unchecked,
      watchList,
      activeInjuries,
      loadNotes,
      sessionFeedbacks,
      checkedInCount: plotted.length,
      rosterCount: playerIds.length,
      uncheckedCount: unchecked.length,
      feedbackCount: sessionFeedbacks.length,
    };
    const leaked = findForbiddenCoachDtoKey(summary);
    if (leaked) {
      console.error("教练摘要含敏感字段:", leaked);
      return { success: false, error: "教练摘要生成失败" };
    }
    return { success: true, summary };
  } catch (error) {
    console.error("数据库写入失败的完整原因:", error);
    return { success: false, error: errorMessage(error) };
  }
}

/** 队务提交情况：无分数、无象限、无 RPE 数值 */
export async function getTeamOpsSummary(
  dateStr?: string
): Promise<ActionResult<{ summary: TeamOpsSummary }>> {
  try {
    const gate = await requireTeamOpsReader();
    if (!gate.success) return gate;

    const date =
      typeof dateStr === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)
        ? dateStr
        : getTeamTodayDateStr(gate.ctx.teamTimeZone);

    const roster = await prisma.player.findMany({
      where: { teamId: gate.ctx.teamId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    });
    const playerIds = roster.map((p) => p.id);
    const day = parseDateOnly(date);

    const [checks, feedbacks] = await Promise.all([
      prisma.readinessCheck.findMany({
        where: { playerId: { in: playerIds }, date: day },
        select: { playerId: true },
      }),
      prisma.sessionFeedback.findMany({
        where: { playerId: { in: playerIds }, date: day },
        select: { playerId: true },
      }),
    ]);

    const checkSet = new Set(checks.map((c) => c.playerId));
    const feedbackSet = new Set(feedbacks.map((f) => f.playerId));

    const rows: TeamOpsRow[] = roster.map((p) => ({
      playerId: p.id,
      playerName: p.name,
      readinessSubmitted: checkSet.has(p.id),
      feedbackSubmitted: feedbackSet.has(p.id),
    }));

    return {
      success: true,
      summary: {
        date,
        rows,
        rosterCount: rows.length,
        readinessCount: rows.filter((r) => r.readinessSubmitted).length,
        feedbackCount: rows.filter((r) => r.feedbackSubmitted).length,
      },
    };
  } catch (error) {
    console.error("队务摘要失败:", error);
    return { success: false, error: errorMessage(error) };
  }
}
