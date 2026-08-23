// CycleProfile 读模型：评估写入与周期 Action 共用，禁止在 readiness 里信任客户端负荷标签。

import { prisma } from "@/lib/db";
import { resolveCycleLength } from "@/lib/clinical/cycleStats";
import { formatDateOnly } from "@/lib/dateOnly";
import type { CycleProfileDto, PeriodStartEventDto } from "@/lib/cycleTypes";

async function loadPeriodStartEvents(
  playerId: string
): Promise<PeriodStartEventDto[]> {
  const rows = await prisma.cycleEvent.findMany({
    where: { playerId, eventType: "period_start" },
    orderBy: { date: "asc" },
    select: { id: true, date: true, crampsScore: true },
  });
  return rows.map((row) => ({
    id: row.id,
    date: formatDateOnly(row.date),
    crampsScore: row.crampsScore,
  }));
}

export async function loadCycleProfileDto(
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

export async function loadPeriodStartDates(playerId: string): Promise<string[]> {
  const events = await loadPeriodStartEvents(playerId);
  return events.map((event) => event.date);
}

export { loadPeriodStartEvents };
