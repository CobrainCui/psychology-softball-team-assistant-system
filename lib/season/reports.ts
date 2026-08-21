"use server";

import { prisma } from "@/lib/db";
import { errorMessage, type ActionResult } from "@/lib/actionResult";
import {
  requireApprovedSession,
  requireTeamSeasonReporter,
} from "@/lib/auth/actionGuard";
import { ATTRIBUTION_FOOTER } from "@/lib/season/types";
import { resolveTeamTimeZone, yearRange, calendarYearOf } from "@/lib/season/timeZone";
import {
  dateStrFromDb,
  eventAttributionDate,
  inCalendarYear,
  inSeasonRange,
  sessionAttributionDate,
} from "@/lib/season/window";

export type HitDist = Record<"LD" | "FB" | "GB" | "PU" | "MISS", number>;

export type SeasonSegmentReport = {
  seasonId: string | null;
  seasonName: string;
  startsOn: string | null;
  effectiveEndsOn: string | null;
  testSessionCount: number;
  hitDist: HitDist;
  confirmedGames: number;
  completedEvents: number;
  gameCoverage: { confirmed: number; completed: number; ratio: number | null };
  scrimmage?: boolean;
};

export type YearReport = {
  year: number;
  footer: string;
  segments: SeasonSegmentReport[];
};

function emptyDist(): HitDist {
  return { LD: 0, FB: 0, GB: 0, PU: 0, MISS: 0 };
}

function addHit(dist: HitDist, result: string) {
  if (result === "LD" || result === "FB" || result === "GB" || result === "PU" || result === "MISS") {
    dist[result] += 1;
  }
}

function coverageRatio(confirmed: number, completed: number): number | null {
  if (completed <= 0) return null;
  return confirmed / completed;
}

export async function getPersonalYearReport(
  year?: number
): Promise<ActionResult<{ report: YearReport }>> {
  try {
    const gate = await requireApprovedSession();
    if (!gate.success) return gate;
    return buildYearReport({
      teamId: gate.ctx.teamId,
      playerId: gate.playerId,
      year,
    });
  } catch (error) {
    console.error("个人年报失败:", error);
    return { success: false, error: errorMessage(error) };
  }
}

export async function getCoachYearReport(
  year?: number
): Promise<ActionResult<{ report: YearReport }>> {
  try {
    const gate = await requireTeamSeasonReporter();
    if (!gate.success) return gate;
    return buildYearReport({ teamId: gate.ctx.teamId, playerId: null, year });
  } catch (error) {
    console.error("教练队报失败:", error);
    return { success: false, error: errorMessage(error) };
  }
}

async function buildYearReport(input: {
  teamId: string;
  playerId: string | null;
  year?: number;
}): Promise<ActionResult<{ report: YearReport }>> {
  const team = await prisma.team.findUnique({
    where: { id: input.teamId },
    select: { timeZone: true },
  });
  const tz = resolveTeamTimeZone(team?.timeZone);
  const year = input.year ?? calendarYearOf(
    (await import("@/lib/season/timeZone")).zonedDateStr(new Date(), tz)
  );
  const { start, end } = yearRange(year);

  const seasons = await prisma.season.findMany({
    where: { teamId: input.teamId },
    orderBy: { startsOn: "asc" },
  });
  const sessions = await prisma.testSession.findMany({
    where: { teamId: input.teamId },
    include: {
      hits: input.playerId
        ? { where: { playerId: input.playerId } }
        : true,
    },
  });
  const events = await prisma.scheduleEvent.findMany({
    where: { teamId: input.teamId },
    include: {
      summaries: {
        where: { status: "confirmed", supersededAt: null },
      },
    },
  });

  const segments: SeasonSegmentReport[] = [];
  for (const season of seasons) {
    const startsOn = dateStrFromDb(season.startsOn);
    const effectiveEndsOn = dateStrFromDb(season.effectiveEndsOn);
    const dist = emptyDist();
    let testSessionCount = 0;
    for (const session of sessions) {
      const day = sessionAttributionDate(session.archivedAt, tz);
      if (!inCalendarYear(day, year)) continue;
      if (!inSeasonRange(day, startsOn, effectiveEndsOn)) continue;
      testSessionCount += 1;
      for (const hit of session.hits) addHit(dist, hit.result);
    }
    const seasonEvents = events.filter((ev) => ev.seasonId === season.id);
    let completed = 0;
    let confirmed = 0;
    for (const ev of seasonEvents) {
      const day = eventAttributionDate(ev.startAt, tz);
      if (!inCalendarYear(day, year)) continue;
      if (ev.status === "completed") completed += 1;
      if (ev.summaries.length > 0) confirmed += 1;
    }
    if (testSessionCount === 0 && completed === 0 && confirmed === 0) continue;
    segments.push({
      seasonId: season.id,
      seasonName: season.name,
      startsOn,
      effectiveEndsOn,
      testSessionCount,
      hitDist: dist,
      confirmedGames: confirmed,
      completedEvents: completed,
      gameCoverage: {
        confirmed,
        completed,
        ratio: coverageRatio(confirmed, completed),
      },
    });
  }

  const dist = emptyDist();
  let testSessionCount = 0;
  let completed = 0;
  let confirmed = 0;
  for (const session of sessions) {
    const day = sessionAttributionDate(session.archivedAt, tz);
    if (!inCalendarYear(day, year)) continue;
    const inAny = seasons.some((s) =>
      inSeasonRange(day, dateStrFromDb(s.startsOn), dateStrFromDb(s.effectiveEndsOn))
    );
    if (inAny) continue;
    testSessionCount += 1;
    for (const hit of session.hits) addHit(dist, hit.result);
  }
  for (const ev of events) {
    if (ev.seasonId) continue;
    const day = eventAttributionDate(ev.startAt, tz);
    if (!inCalendarYear(day, year)) continue;
    if (ev.status === "completed") completed += 1;
    if (ev.summaries.length > 0) confirmed += 1;
  }
  if (testSessionCount > 0 || completed > 0 || confirmed > 0) {
    segments.push({
      seasonId: null,
      seasonName: "非赛季教学赛 / 未归属",
      startsOn: start,
      effectiveEndsOn: end,
      testSessionCount,
      hitDist: dist,
      confirmedGames: confirmed,
      completedEvents: completed,
      gameCoverage: {
        confirmed,
        completed,
        ratio: coverageRatio(confirmed, completed),
      },
      scrimmage: true,
    });
  }

  return {
    success: true,
    report: { year, footer: ATTRIBUTION_FOOTER, segments },
  };
}
