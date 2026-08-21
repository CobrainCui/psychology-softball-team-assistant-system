"use server";

import { prisma } from "@/lib/db";
import { errorMessage, type ActionResult } from "@/lib/actionResult";
import { writeAuditLog } from "@/lib/auth/audit";
import {
  requireScheduleManager,
  requireScheduleViewer,
} from "@/lib/auth/actionGuard";
import {
  canDeleteEvent,
  canTransitionEvent,
  requiresSeason,
} from "@/lib/season/invariants";
import { resolveTeamTimeZone } from "@/lib/season/timeZone";
import type { MatchWindowDto, ScheduleEventDto } from "@/lib/season/types";
import {
  formatInstantInZone,
  isInPlannedMatchWindow,
} from "@/lib/season/window";

function toDto(row: {
  id: string;
  teamId: string;
  seasonId: string | null;
  kind: ScheduleEventDto["kind"];
  status: ScheduleEventDto["status"];
  startAt: Date;
  endAt: Date;
  opponent: string | null;
  venue: string | null;
  title: string | null;
  note: string | null;
  statusNote: string | null;
}): ScheduleEventDto {
  return {
    id: row.id,
    teamId: row.teamId,
    seasonId: row.seasonId,
    kind: row.kind,
    status: row.status,
    startAt: row.startAt.toISOString(),
    endAt: row.endAt.toISOString(),
    opponent: row.opponent,
    venue: row.venue,
    title: row.title,
    note: row.note,
    statusNote: row.statusNote,
  };
}

async function loadTeamTz(teamId: string): Promise<string> {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { timeZone: true },
  });
  return resolveTeamTimeZone(team?.timeZone);
}

export async function listScheduleEvents(): Promise<
  ActionResult<{ events: ScheduleEventDto[] }>
> {
  try {
    const gate = await requireScheduleViewer();
    if (!gate.success) return gate;
    const rows = await prisma.scheduleEvent.findMany({
      where: { teamId: gate.ctx.teamId },
      orderBy: { startAt: "desc" },
    });
    return { success: true, events: rows.map(toDto) };
  } catch (error) {
    console.error("列出赛程失败:", error);
    return { success: false, error: errorMessage(error) };
  }
}

export async function getMatchWindow(): Promise<
  ActionResult<{ window: MatchWindowDto | null; offseason: boolean; timeZone: string }>
> {
  try {
    const gate = await requireScheduleViewer();
    if (!gate.success) return gate;
    const tz = await loadTeamTz(gate.ctx.teamId);
    const now = new Date();
    const active = await prisma.season.findFirst({
      where: { teamId: gate.ctx.teamId, status: "active" },
    });
    if (!active) {
      return { success: true, window: null, offseason: true, timeZone: tz };
    }
    const events = await prisma.scheduleEvent.findMany({
      where: {
        teamId: gate.ctx.teamId,
        seasonId: active.id,
        status: "planned",
      },
    });
    const hit = events.find((ev) =>
      isInPlannedMatchWindow(now, ev.startAt, ev.endAt, ev.status)
    );
    if (!hit) {
      return { success: true, window: null, offseason: false, timeZone: tz };
    }
    return {
      success: true,
      offseason: false,
      timeZone: tz,
      window: {
        eventId: hit.id,
        title: hit.title || hit.opponent || "比赛",
        opponent: hit.opponent,
        startAt: hit.startAt.toISOString(),
        endAt: hit.endAt.toISOString(),
        displayStart: formatInstantInZone(hit.startAt, tz),
        displayEnd: formatInstantInZone(hit.endAt, tz),
      },
    };
  } catch (error) {
    console.error("读取比赛窗口失败:", error);
    return { success: false, error: errorMessage(error) };
  }
}

export async function createScheduleEvent(input: {
  seasonId?: string | null;
  kind: ScheduleEventDto["kind"];
  startAt: string;
  endAt: string;
  opponent?: string;
  venue?: string;
  title?: string;
  note?: string;
}): Promise<ActionResult<{ event: ScheduleEventDto }>> {
  try {
    const gate = await requireScheduleManager();
    if (!gate.success) return gate;
    const startAt = new Date(input.startAt);
    const endAt = new Date(input.endAt);
    if (!(endAt.getTime() > startAt.getTime())) {
      return { success: false, error: "结束时间必须晚于开始时间" };
    }
    let seasonId = input.seasonId?.trim() || null;
    if (requiresSeason(input.kind) && !seasonId) {
      return { success: false, error: "正式比赛须挂到赛季" };
    }
    if (!requiresSeason(input.kind)) {
      seasonId = null;
    }
    if (seasonId) {
      const season = await prisma.season.findFirst({
        where: { id: seasonId, teamId: gate.ctx.teamId },
      });
      if (!season) return { success: false, error: "赛季不存在或不在本队" };
      if (season.status === "archived") {
        return { success: false, error: "已归档赛季不可再挂事件" };
      }
    }
    const row = await prisma.scheduleEvent.create({
      data: {
        teamId: gate.ctx.teamId,
        seasonId,
        kind: input.kind,
        startAt,
        endAt,
        opponent: input.opponent?.trim() || null,
        venue: input.venue?.trim() || null,
        title: input.title?.trim() || null,
        note: input.note?.trim() || null,
      },
    });
    await writeAuditLog({
      action: "schedule_event_created",
      actorAccountId: gate.ctx.accountId,
      targetId: row.id,
    });
    return { success: true, event: toDto(row) };
  } catch (error) {
    console.error("创建赛程失败:", error);
    return { success: false, error: errorMessage(error) };
  }
}

export async function updateScheduleEvent(input: {
  eventId: string;
  startAt?: string;
  endAt?: string;
  opponent?: string;
  venue?: string;
  title?: string;
  note?: string;
}): Promise<ActionResult<{ event: ScheduleEventDto }>> {
  try {
    const gate = await requireScheduleManager();
    if (!gate.success) return gate;
    const existing = await prisma.scheduleEvent.findFirst({
      where: { id: input.eventId, teamId: gate.ctx.teamId },
      include: { season: { select: { status: true } } },
    });
    if (!existing) return { success: false, error: "事件不存在" };
    if (existing.season?.status === "archived") {
      return { success: false, error: "已归档赛季的事件只读" };
    }
    if (existing.status !== "planned") {
      return { success: false, error: "仅计划中的事件可直接修改" };
    }
    const startAt = input.startAt ? new Date(input.startAt) : existing.startAt;
    const endAt = input.endAt ? new Date(input.endAt) : existing.endAt;
    if (!(endAt.getTime() > startAt.getTime())) {
      return { success: false, error: "结束时间必须晚于开始时间" };
    }
    const row = await prisma.scheduleEvent.update({
      where: { id: existing.id },
      data: {
        startAt,
        endAt,
        opponent: input.opponent !== undefined ? input.opponent.trim() || null : existing.opponent,
        venue: input.venue !== undefined ? input.venue.trim() || null : existing.venue,
        title: input.title !== undefined ? input.title.trim() || null : existing.title,
        note: input.note !== undefined ? input.note.trim() || null : existing.note,
      },
    });
    return { success: true, event: toDto(row) };
  } catch (error) {
    console.error("更新赛程失败:", error);
    return { success: false, error: errorMessage(error) };
  }
}

export async function cancelScheduleEvent(
  eventId: string,
  reason: string
): Promise<ActionResult<{ event: ScheduleEventDto }>> {
  try {
    const gate = await requireScheduleManager();
    if (!gate.success) return gate;
    const note = reason.trim();
    if (!note) return { success: false, error: "取消须填写原因" };
    const existing = await prisma.scheduleEvent.findFirst({
      where: { id: eventId, teamId: gate.ctx.teamId },
    });
    if (!existing) return { success: false, error: "事件不存在" };
    if (!canTransitionEvent(existing.status, "cancelled")) {
      return { success: false, error: "当前状态不可取消" };
    }
    const row = await prisma.scheduleEvent.update({
      where: { id: existing.id },
      data: { status: "cancelled", statusNote: note },
    });
    await writeAuditLog({
      action: "schedule_event_cancelled",
      actorAccountId: gate.ctx.accountId,
      targetId: row.id,
      metadata: { reason: note },
    });
    return { success: true, event: toDto(row) };
  } catch (error) {
    console.error("取消赛程失败:", error);
    return { success: false, error: errorMessage(error) };
  }
}

export async function completeScheduleEvent(
  eventId: string
): Promise<ActionResult<{ event: ScheduleEventDto }>> {
  try {
    const gate = await requireScheduleManager();
    if (!gate.success) return gate;
    const existing = await prisma.scheduleEvent.findFirst({
      where: { id: eventId, teamId: gate.ctx.teamId },
    });
    if (!existing) return { success: false, error: "事件不存在" };
    if (!canTransitionEvent(existing.status, "completed")) {
      return { success: false, error: "当前状态不可标记完成" };
    }
    const row = await prisma.scheduleEvent.update({
      where: { id: existing.id },
      data: { status: "completed" },
    });
    return { success: true, event: toDto(row) };
  } catch (error) {
    console.error("完成赛程失败:", error);
    return { success: false, error: errorMessage(error) };
  }
}

export async function reopenScheduleEvent(
  eventId: string,
  reason: string
): Promise<ActionResult<{ event: ScheduleEventDto }>> {
  try {
    const gate = await requireScheduleManager();
    if (!gate.success) return gate;
    const note = reason.trim();
    if (!note) return { success: false, error: "重开须填写原因" };
    const existing = await prisma.scheduleEvent.findFirst({
      where: { id: eventId, teamId: gate.ctx.teamId },
    });
    if (!existing) return { success: false, error: "事件不存在" };
    if (!canTransitionEvent(existing.status, "planned")) {
      return { success: false, error: "仅已取消事件可以重开" };
    }
    const row = await prisma.scheduleEvent.update({
      where: { id: existing.id },
      data: { status: "planned", statusNote: note },
    });
    await writeAuditLog({
      action: "schedule_event_reopened",
      actorAccountId: gate.ctx.accountId,
      targetId: row.id,
      metadata: { reason: note },
    });
    return { success: true, event: toDto(row) };
  } catch (error) {
    console.error("重开赛程失败:", error);
    return { success: false, error: errorMessage(error) };
  }
}

export async function correctCompletedEvent(input: {
  eventId: string;
  startAt?: string;
  endAt?: string;
  opponent?: string;
}): Promise<ActionResult<{ event: ScheduleEventDto }>> {
  try {
    const gate = await requireScheduleManager();
    if (!gate.success) return gate;
    const existing = await prisma.scheduleEvent.findFirst({
      where: { id: input.eventId, teamId: gate.ctx.teamId },
    });
    if (!existing) return { success: false, error: "事件不存在" };
    if (existing.status !== "completed") {
      return { success: false, error: "仅已完成事件走显式更正" };
    }
    const startAt = input.startAt ? new Date(input.startAt) : existing.startAt;
    const endAt = input.endAt ? new Date(input.endAt) : existing.endAt;
    if (!(endAt.getTime() > startAt.getTime())) {
      return { success: false, error: "结束时间必须晚于开始时间" };
    }
    const row = await prisma.scheduleEvent.update({
      where: { id: existing.id },
      data: {
        startAt,
        endAt,
        opponent:
          input.opponent !== undefined
            ? input.opponent.trim() || null
            : existing.opponent,
        correctedAt: new Date(),
        correctedById: gate.ctx.accountId,
      },
    });
    await writeAuditLog({
      action: "schedule_event_corrected",
      actorAccountId: gate.ctx.accountId,
      targetId: row.id,
    });
    return { success: true, event: toDto(row) };
  } catch (error) {
    console.error("更正已完成事件失败:", error);
    return { success: false, error: errorMessage(error) };
  }
}

export async function deleteScheduleEvent(
  eventId: string
): Promise<ActionResult> {
  try {
    const gate = await requireScheduleManager();
    if (!gate.success) return gate;
    const existing = await prisma.scheduleEvent.findFirst({
      where: { id: eventId, teamId: gate.ctx.teamId },
    });
    if (!existing) return { success: false, error: "事件不存在" };
    if (!canDeleteEvent(existing.status)) {
      return { success: false, error: "仅计划中的事件可以删除" };
    }
    await prisma.scheduleEvent.delete({ where: { id: existing.id } });
    await writeAuditLog({
      action: "schedule_event_deleted",
      actorAccountId: gate.ctx.accountId,
      targetId: eventId,
    });
    return { success: true };
  } catch (error) {
    console.error("删除赛程失败:", error);
    return { success: false, error: errorMessage(error) };
  }
}
