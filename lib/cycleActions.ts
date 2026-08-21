"use server";

import { prisma } from "@/lib/db";
import { resolveCycleLength } from "@/lib/clinical/cycleStats";
import type {
  CycleProfileDto,
  CycleSharingLevel,
  PeriodStartEventDto,
} from "@/lib/cycleTypes";
import { formatDateOnly, parseDateOnly } from "@/lib/dateOnly";
import type { ActionResult } from "@/lib/actionResult";
import { clampScore0to10, errorMessage } from "@/lib/status/shared";
import { requireOwnDataWriter } from "@/lib/auth/actionGuard";

const CYCLE_SHARING_LEVELS = new Set<CycleSharingLevel>([
  "none",
  "load_only",
  "phase_label",
]);

function asCycleSharingLevel(value: unknown): CycleSharingLevel | null {
  return typeof value === "string" &&
    CYCLE_SHARING_LEVELS.has(value as CycleSharingLevel)
    ? (value as CycleSharingLevel)
    : null;
}

async function loadPeriodStartEvents(
  playerId: string
): Promise<PeriodStartEventDto[]> {
  const rows = await prisma.cycleEvent.findMany({
    where: { playerId, eventType: "period_start" },
    orderBy: { date: "asc" },
    select: { id: true, date: true, crampsScore: true },
  });
  return rows.map((r) => ({
    id: r.id,
    date: formatDateOnly(r.date),
    crampsScore: r.crampsScore,
  }));
}

async function loadPeriodStartDates(playerId: string): Promise<string[]> {
  const events = await loadPeriodStartEvents(playerId);
  return events.map((event) => event.date);
}

async function toCycleProfileDto(
  playerId: string
): Promise<CycleProfileDto | null> {
  const profile = await prisma.cycleProfile.findUnique({
    where: { playerId },
  });
  if (!profile) return null;

  const periodStartEvents = await loadPeriodStartEvents(playerId);
  const periodStartDates = periodStartEvents.map((event) => event.date);
  const resolved = resolveCycleLength(periodStartDates);

  return {
    trackingEnabled: profile.trackingEnabled,
    sharingLevel: profile.sharingLevel,
    typicalLengthDays: profile.typicalLengthDays,
    hormonalContraception: profile.hormonalContraception,
    bodyImageAnxietyOptIn: profile.bodyImageAnxietyOptIn,
    consentAt: profile.consentAt ? profile.consentAt.toISOString() : null,
    periodStartDates,
    periodStartEvents,
    lastPeriodStart:
      periodStartDates.length > 0
        ? periodStartDates[periodStartDates.length - 1]!
        : null,
    resolvedLengthDays:
      profile.typicalLengthDays ?? resolved.typicalLengthDays,
    confidence: resolved.confidence,
    highVariance: resolved.highVariance,
  };
}

async function refreshTypicalLength(playerId: string): Promise<void> {
  const dates = await loadPeriodStartDates(playerId);
  const resolved = resolveCycleLength(dates);
  await prisma.cycleProfile.update({
    where: { playerId },
    data: {
      typicalLengthDays:
        resolved.intervalCount >= 2 ? resolved.typicalLengthDays : null,
    },
  });
}

export async function getCycleProfile(): Promise<
  ActionResult<{ profile: CycleProfileDto | null }>
> {
  try {
    const gate = await requireOwnDataWriter();
    if (!gate.success) return gate;
    const profile = await toCycleProfileDto(gate.playerId);
    return { success: true, profile };
  } catch (error) {
    console.error("数据库写入失败的完整原因:", error);
    return { success: false, error: errorMessage(error) };
  }
}

export type ConsentCyclePayload = {
  sharingLevel?: CycleSharingLevel;
  seedPeriodStart?: string;
};

export async function consentToCycleTracking(
  payload: ConsentCyclePayload
): Promise<ActionResult<{ profile: CycleProfileDto }>> {
  try {
    const gate = await requireOwnDataWriter();
    if (!gate.success) return gate;
    const playerId = gate.playerId;
    const sharingLevel = asCycleSharingLevel(payload.sharingLevel) ?? "none";

    const player = await prisma.player.findUnique({
      where: { id: playerId },
      select: { id: true },
    });
    if (!player) {
      return { success: false, error: "云端无此队员" };
    }

    const now = new Date();
    await prisma.cycleProfile.upsert({
      where: { playerId: player.id },
      create: {
        player: { connect: { id: player.id } },
        trackingEnabled: true,
        sharingLevel,
        consentAt: now,
      },
      update: {
        trackingEnabled: true,
        sharingLevel,
        consentAt: now,
      },
    });

    const seed = payload.seedPeriodStart;
    if (typeof seed === "string" && /^\d{4}-\d{2}-\d{2}$/.test(seed)) {
      const date = parseDateOnly(seed);
      const existing = await prisma.cycleEvent.findFirst({
        where: {
          playerId: player.id,
          eventType: "period_start",
          date,
        },
      });
      if (!existing) {
        await prisma.cycleEvent.create({
          data: {
            player: { connect: { id: player.id } },
            eventType: "period_start",
            date,
          },
        });
      }
      await refreshTypicalLength(player.id);
    }

    const profile = await toCycleProfileDto(player.id);
    if (!profile) {
      return { success: false, error: "周期档案写入失败" };
    }
    return { success: true, profile };
  } catch (error) {
    console.error("数据库写入失败的完整原因:", error);
    return { success: false, error: errorMessage(error) };
  }
}

export type UpdateCycleProfilePayload = {
  sharingLevel?: CycleSharingLevel;
  hormonalContraception?: boolean;
  bodyImageAnxietyOptIn?: boolean;
  trackingEnabled?: boolean;
};

export async function updateCycleProfileSettings(
  payload: UpdateCycleProfilePayload
): Promise<ActionResult<{ profile: CycleProfileDto }>> {
  try {
    const gate = await requireOwnDataWriter();
    if (!gate.success) return gate;
    const playerId = gate.playerId;

    const existing = await prisma.cycleProfile.findUnique({
      where: { playerId },
    });
    if (!existing || !existing.consentAt) {
      return { success: false, error: "请先完成知情同意" };
    }

    const sharingLevel = asCycleSharingLevel(payload.sharingLevel);
    await prisma.cycleProfile.update({
      where: { playerId },
      data: {
        ...(sharingLevel ? { sharingLevel } : {}),
        ...(typeof payload.hormonalContraception === "boolean"
          ? { hormonalContraception: payload.hormonalContraception }
          : {}),
        ...(typeof payload.bodyImageAnxietyOptIn === "boolean"
          ? { bodyImageAnxietyOptIn: payload.bodyImageAnxietyOptIn }
          : {}),
        ...(typeof payload.trackingEnabled === "boolean"
          ? { trackingEnabled: payload.trackingEnabled }
          : {}),
      },
    });

    const profile = await toCycleProfileDto(playerId);
    if (!profile) {
      return { success: false, error: "周期档案读取失败" };
    }
    return { success: true, profile };
  } catch (error) {
    console.error("数据库写入失败的完整原因:", error);
    return { success: false, error: errorMessage(error) };
  }
}

export type RecordPeriodStartPayload = {
  date: string;
  crampsScore?: number;
};

export async function recordPeriodStart(
  payload: RecordPeriodStartPayload
): Promise<ActionResult<{ profile: CycleProfileDto }>> {
  try {
    const gate = await requireOwnDataWriter();
    if (!gate.success) return gate;
    const playerId = gate.playerId;
    if (
      typeof payload.date !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(payload.date)
    ) {
      return { success: false, error: "date 须为 YYYY-MM-DD" };
    }

    const profileRow = await prisma.cycleProfile.findUnique({
      where: { playerId },
    });
    if (!profileRow?.consentAt || !profileRow.trackingEnabled) {
      return { success: false, error: "周期追踪未开启" };
    }

    const date = parseDateOnly(payload.date);
    const crampsScore = clampScore0to10(payload.crampsScore);
    const existing = await prisma.cycleEvent.findFirst({
      where: {
        playerId,
        eventType: "period_start",
        date,
      },
    });
    if (!existing) {
      await prisma.cycleEvent.create({
        data: {
          player: { connect: { id: playerId } },
          eventType: "period_start",
          date,
          crampsScore,
        },
      });
    } else if (crampsScore !== null) {
      await prisma.cycleEvent.update({
        where: { id: existing.id },
        data: { crampsScore },
      });
    }

    await refreshTypicalLength(playerId);
    const profile = await toCycleProfileDto(playerId);
    if (!profile) {
      return { success: false, error: "周期档案读取失败" };
    }
    return { success: true, profile };
  } catch (error) {
    console.error("数据库写入失败的完整原因:", error);
    return { success: false, error: errorMessage(error) };
  }
}

export type UpdatePeriodStartEventPayload = {
  eventId: string;
  date?: string;
  crampsScore?: number | null;
};

export async function updatePeriodStartEvent(
  payload: UpdatePeriodStartEventPayload
): Promise<ActionResult<{ profile: CycleProfileDto }>> {
  try {
    const gate = await requireOwnDataWriter();
    if (!gate.success) return gate;
    const playerId = gate.playerId;

    const existing = await prisma.cycleEvent.findFirst({
      where: {
        id: payload.eventId,
        playerId,
        eventType: "period_start",
      },
    });
    if (!existing) return { success: false, error: "找不到该经期开始记录" };

    const data: { date?: Date; crampsScore?: number | null } = {};
    if (typeof payload.date === "string") {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(payload.date)) {
        return { success: false, error: "date 须为 YYYY-MM-DD" };
      }
      const nextDate = parseDateOnly(payload.date);
      const clash = await prisma.cycleEvent.findFirst({
        where: {
          playerId,
          eventType: "period_start",
          date: nextDate,
          NOT: { id: existing.id },
        },
      });
      if (clash) {
        return { success: false, error: "该日已有经期开始记录" };
      }
      data.date = nextDate;
    }
    if (payload.crampsScore === null) {
      data.crampsScore = null;
    } else if (payload.crampsScore !== undefined) {
      const cramps = clampScore0to10(payload.crampsScore);
      if (cramps === null) return { success: false, error: "痛经评分无效" };
      data.crampsScore = cramps;
    }

    await prisma.cycleEvent.update({
      where: { id: existing.id },
      data,
    });
    await refreshTypicalLength(playerId);
    const profile = await toCycleProfileDto(playerId);
    if (!profile) return { success: false, error: "周期档案读取失败" };
    return { success: true, profile };
  } catch (error) {
    console.error("数据库写入失败的完整原因:", error);
    return { success: false, error: errorMessage(error) };
  }
}

export async function deletePeriodStartEvent(payload: {
  eventId: string;
}): Promise<ActionResult<{ profile: CycleProfileDto }>> {
  try {
    const gate = await requireOwnDataWriter();
    if (!gate.success) return gate;
    const playerId = gate.playerId;

    const existing = await prisma.cycleEvent.findFirst({
      where: {
        id: payload.eventId,
        playerId,
        eventType: "period_start",
      },
    });
    if (!existing) return { success: false, error: "找不到该经期开始记录" };
    await prisma.cycleEvent.delete({ where: { id: existing.id } });
    await refreshTypicalLength(playerId);
    const profile = await toCycleProfileDto(playerId);
    if (!profile) return { success: false, error: "周期档案读取失败" };
    return { success: true, profile };
  } catch (error) {
    console.error("数据库写入失败的完整原因:", error);
    return { success: false, error: errorMessage(error) };
  }
}
