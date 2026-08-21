"use server";

import { prisma } from "@/lib/db";
import { errorMessage, type ActionResult } from "@/lib/actionResult";
import { writeAuditLog } from "@/lib/auth/audit";
import { requireScheduleManager, requireScheduleViewer } from "@/lib/auth/actionGuard";
import { parseDateOnly } from "@/lib/dateOnly";
import {
  canActivateSeason,
  canArchiveSeason,
  canDeleteSeason,
  canMutateSeason,
} from "@/lib/season/invariants";
import { isValidIanaTimeZone, minDateStr, zonedDateStr } from "@/lib/season/timeZone";
import type { SeasonDto } from "@/lib/season/types";
import { dateStrFromDb } from "@/lib/season/window";

function toDto(row: {
  id: string;
  teamId: string;
  name: string;
  startsOn: Date;
  endsOn: Date;
  effectiveEndsOn: Date;
  status: SeasonDto["status"];
}): SeasonDto {
  return {
    id: row.id,
    teamId: row.teamId,
    name: row.name,
    startsOn: dateStrFromDb(row.startsOn),
    endsOn: dateStrFromDb(row.endsOn),
    effectiveEndsOn: dateStrFromDb(row.effectiveEndsOn),
    status: row.status,
  };
}

function overlapError(error: unknown): string | null {
  const code =
    error && typeof error === "object" && "code" in error
      ? String((error as { code?: string }).code)
      : "";
  const msg = errorMessage(error);
  if (
    code === "P2039" ||
    msg.includes("Season_team_dates_excl") ||
    msg.includes("23P01") ||
    msg.includes("exclusion constraint")
  ) {
    return "与已有赛季日期重叠";
  }
  if (code === "P2002" || msg.includes("Season_one_active_per_team")) {
    return "本队已有进行中的赛季";
  }
  return null;
}

async function teamTimeZone(teamId: string): Promise<string> {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { timeZone: true },
  });
  const tz = team?.timeZone ?? "Asia/Shanghai";
  return isValidIanaTimeZone(tz) ? tz : "Asia/Shanghai";
}

export async function listSeasons(): Promise<
  ActionResult<{ seasons: SeasonDto[]; timeZone: string; active: SeasonDto | null }>
> {
  try {
    const gate = await requireScheduleViewer();
    if (!gate.success) return gate;
    const tz = await teamTimeZone(gate.ctx.teamId);
    const rows = await prisma.season.findMany({
      where: { teamId: gate.ctx.teamId },
      orderBy: { startsOn: "desc" },
    });
    const seasons = rows.map(toDto);
    return {
      success: true,
      seasons,
      timeZone: tz,
      active: seasons.find((s) => s.status === "active") ?? null,
    };
  } catch (error) {
    console.error("列出赛季失败:", error);
    return { success: false, error: errorMessage(error) };
  }
}

export async function createSeason(input: {
  name: string;
  startsOn: string;
  endsOn: string;
}): Promise<ActionResult<{ season: SeasonDto }>> {
  try {
    const gate = await requireScheduleManager();
    if (!gate.success) return gate;
    const name = input.name.trim();
    if (!name) return { success: false, error: "请填写赛季名称" };
    if (input.startsOn > input.endsOn) {
      return { success: false, error: "开始日不能晚于结束日" };
    }
    const startsOn = parseDateOnly(input.startsOn);
    const endsOn = parseDateOnly(input.endsOn);
    const row = await prisma.season.create({
      data: {
        teamId: gate.ctx.teamId,
        name,
        startsOn,
        endsOn,
        effectiveEndsOn: endsOn,
        status: "planned",
      },
    });
    await writeAuditLog({
      action: "season_created",
      actorAccountId: gate.ctx.accountId,
      targetId: row.id,
    });
    return { success: true, season: toDto(row) };
  } catch (error) {
    const mapped = overlapError(error);
    if (!mapped) console.error("创建赛季失败:", error);
    return { success: false, error: mapped ?? errorMessage(error) };
  }
}

export async function updateSeason(input: {
  seasonId: string;
  name?: string;
  startsOn?: string;
  endsOn?: string;
}): Promise<ActionResult<{ season: SeasonDto }>> {
  try {
    const gate = await requireScheduleManager();
    if (!gate.success) return gate;
    const existing = await prisma.season.findFirst({
      where: { id: input.seasonId, teamId: gate.ctx.teamId },
    });
    if (!existing) return { success: false, error: "赛季不存在" };
    if (!canMutateSeason(existing.status) || existing.status === "archived") {
      return { success: false, error: "已归档赛季不可修改" };
    }
    if (existing.status === "active" && (input.startsOn || input.endsOn)) {
      return { success: false, error: "进行中的赛季不可改日期" };
    }
    const startsOn = input.startsOn
      ? parseDateOnly(input.startsOn)
      : existing.startsOn;
    const endsOn = input.endsOn ? parseDateOnly(input.endsOn) : existing.endsOn;
    if (dateStrFromDb(startsOn) > dateStrFromDb(endsOn)) {
      return { success: false, error: "开始日不能晚于结束日" };
    }
    const row = await prisma.season.update({
      where: { id: existing.id },
      data: {
        name: input.name?.trim() || existing.name,
        startsOn,
        endsOn,
        effectiveEndsOn:
          existing.status === "planned" ? endsOn : existing.effectiveEndsOn,
      },
    });
    return { success: true, season: toDto(row) };
  } catch (error) {
    console.error("更新赛季失败:", error);
    return { success: false, error: overlapError(error) ?? errorMessage(error) };
  }
}

export async function activateSeason(
  seasonId: string
): Promise<ActionResult<{ season: SeasonDto }>> {
  try {
    const gate = await requireScheduleManager();
    if (!gate.success) return gate;
    const row = await prisma.$transaction(async (tx) => {
      const existing = await tx.season.findFirst({
        where: { id: seasonId, teamId: gate.ctx.teamId },
      });
      if (!existing) throw new Error("赛季不存在");
      if (!canActivateSeason(existing.status)) {
        throw new Error("仅计划中的赛季可以开启");
      }
      const active = await tx.season.findFirst({
        where: { teamId: gate.ctx.teamId, status: "active" },
      });
      if (active) throw new Error("本队已有进行中的赛季");
      return tx.season.update({
        where: { id: existing.id },
        data: {
          status: "active",
          activatedById: gate.ctx.accountId,
          activatedAt: new Date(),
        },
      });
    });
    await writeAuditLog({
      action: "season_activated",
      actorAccountId: gate.ctx.accountId,
      targetId: row.id,
    });
    return { success: true, season: toDto(row) };
  } catch (error) {
    const mapped = overlapError(error);
    if (!mapped) console.error("开启赛季失败:", error);
    return { success: false, error: mapped ?? errorMessage(error) };
  }
}

export async function archiveSeason(
  seasonId: string
): Promise<ActionResult<{ season: SeasonDto }>> {
  try {
    const gate = await requireScheduleManager();
    if (!gate.success) return gate;
    const tz = await teamTimeZone(gate.ctx.teamId);
    const today = zonedDateStr(new Date(), tz);
    const row = await prisma.$transaction(async (tx) => {
      const existing = await tx.season.findFirst({
        where: { id: seasonId, teamId: gate.ctx.teamId },
      });
      if (!existing) throw new Error("赛季不存在");
      if (!canArchiveSeason(existing.status)) {
        throw new Error("仅进行中的赛季可以归档");
      }
      const startsOn = dateStrFromDb(existing.startsOn);
      if (today < startsOn) {
        throw new Error("赛季尚未开始，请删除仍为计划中的赛季");
      }
      const endsOn = dateStrFromDb(existing.endsOn);
      const effective = minDateStr(endsOn, today);
      return tx.season.update({
        where: { id: existing.id },
        data: {
          status: "archived",
          effectiveEndsOn: parseDateOnly(effective),
          archivedById: gate.ctx.accountId,
          archivedAt: new Date(),
        },
      });
    });
    await writeAuditLog({
      action: "season_archived",
      actorAccountId: gate.ctx.accountId,
      targetId: row.id,
    });
    return { success: true, season: toDto(row) };
  } catch (error) {
    const msg = errorMessage(error);
    if (!msg.includes("尚未开始") && !msg.includes("仅进行中") && !msg.includes("不存在")) {
      console.error("归档赛季失败:", error);
    }
    return { success: false, error: overlapError(error) ?? msg };
  }
}

export async function deleteSeason(
  seasonId: string
): Promise<ActionResult> {
  try {
    const gate = await requireScheduleManager();
    if (!gate.success) return gate;
    const existing = await prisma.season.findFirst({
      where: { id: seasonId, teamId: gate.ctx.teamId },
      include: { events: { select: { id: true }, take: 1 } },
    });
    if (!existing) return { success: false, error: "赛季不存在" };
    if (!canDeleteSeason(existing.status)) {
      return { success: false, error: "仅计划中的赛季可以删除" };
    }
    if (existing.events.length > 0) {
      return { success: false, error: "请先删除该赛季下的赛程事件" };
    }
    await prisma.season.delete({ where: { id: existing.id } });
    await writeAuditLog({
      action: "season_deleted",
      actorAccountId: gate.ctx.accountId,
      targetId: seasonId,
    });
    return { success: true };
  } catch (error) {
    console.error("删除赛季失败:", error);
    return { success: false, error: errorMessage(error) };
  }
}
