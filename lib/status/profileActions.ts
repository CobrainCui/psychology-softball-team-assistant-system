"use server";

import { prisma } from "@/lib/db";
import {
  type HitQuality,
  type HitRecord,
  type HitResult,
  type PitchType,
  type SpeedRecord,
} from "@/lib/gameArchive";
import { QUADRANT_LABEL, type PreQuadrant } from "@/lib/clinical/preQuadrant";
import { formatDateOnly } from "@/lib/dateOnly";
import {
  buildBodyInsight30dReport,
  type BodyInsight30dReport,
} from "@/lib/clinical/bodyInsight30d";
import type { InjuryCaseStatus } from "@/lib/clinical/injuryKinds";
import type { ActionResult } from "@/lib/actionResult";
import { caseInclude, errorMessage, mapCase, type CaseRow } from "@/lib/status/shared";
import { requireApprovedSession } from "@/lib/auth/actionGuard";

export type ProfileInjuryBrief = {
  id: string;
  painAreaLabel: string;
  status: InjuryCaseStatus;
  latestPain: number | null;
  trendLabel: string;
  startDate: string;
};

export type ProfileLatestStatus = {
  date: string;
  quadrant: PreQuadrant;
  quadrantLabel: string;
  physicalBattery: number;
  mentalDrive: number;
};

export async function getPlayerProfileData(): Promise<
  ActionResult<{
    hits: HitRecord[];
    speedRecords: SpeedRecord[];
    sessionCount: number;
    latestStatus: ProfileLatestStatus | null;
    injuryCases: ProfileInjuryBrief[];
    insight: BodyInsight30dReport | null;
  }>
> {
  try {
    const gate = await requireApprovedSession();
    if (!gate.success) return gate;
    const playerId = gate.playerId;

    const player = await prisma.player.findUnique({
      where: { id: playerId },
      select: { id: true, name: true },
    });
    if (!player) {
      return { success: false, error: "云端无此队员" };
    }

    const [hitRows, speedRows, latestCheck, caseRows, preRows, postRows] =
      await Promise.all([
        prisma.hit.findMany({
          where: { playerId: player.id },
          orderBy: { recordedAt: "asc" },
        }),
        prisma.speedRecord.findMany({
          where: { playerId: player.id },
          orderBy: { recordedAt: "asc" },
        }),
        prisma.readinessCheck.findFirst({
          where: { playerId: player.id },
          orderBy: { date: "desc" },
        }),
        prisma.injuryCase.findMany({
          where: { playerId: player.id },
          include: caseInclude,
          orderBy: { updatedAt: "desc" },
          take: 8,
        }),
        prisma.readinessCheck.findMany({
          where: { playerId: player.id },
          orderBy: { date: "desc" },
          take: 40,
        }),
        prisma.sessionFeedback.findMany({
          where: { playerId: player.id },
          orderBy: { createdAt: "desc" },
          take: 80,
        }),
      ]);

    const hits: HitRecord[] = hitRows.map((hit) => ({
      id: hit.id,
      x: hit.x ?? undefined,
      y: hit.y ?? undefined,
      result: hit.result as HitResult,
      playerId: hit.playerId,
      playerName: player.name,
      pitchType: (hit.pitchType as PitchType | null) ?? undefined,
      hitQuality: (hit.hitQuality as HitQuality | null) ?? undefined,
      timestamp: hit.recordedAt.getTime(),
    }));

    const speedRecords: SpeedRecord[] = speedRows.map((row) => ({
      id: row.id,
      playerId: row.playerId,
      playerName: player.name,
      firstBaseSeconds: row.firstBaseSeconds,
      secondBaseSeconds: row.secondBaseSeconds,
      customSeconds: row.customSeconds,
      timestamp: row.recordedAt.getTime(),
    }));

    const sessionCount = new Set([
      ...hitRows.map((h) => h.sessionId),
      ...speedRows.map((s) => s.sessionId),
    ]).size;

    const mappedCases = caseRows.map((row) => mapCase(row as CaseRow));
    const injuryCases: ProfileInjuryBrief[] = mappedCases.map((c) => ({
      id: c.id,
      painAreaLabel: c.painAreaLabel,
      status: c.status,
      latestPain: c.latestPain,
      trendLabel: c.trend.label,
      startDate: c.startDate,
    }));

    const latestStatus: ProfileLatestStatus | null = latestCheck
      ? {
          date: formatDateOnly(latestCheck.date),
          quadrant: latestCheck.quadrant,
          quadrantLabel: QUADRANT_LABEL[latestCheck.quadrant],
          physicalBattery: latestCheck.physicalBattery,
          mentalDrive: latestCheck.mentalDrive,
        }
      : null;

    const painList = mappedCases.flatMap((c) =>
      c.painLogs.map((l) => ({
        date: l.date,
        painArea: c.painArea,
        painScore: l.painScore,
      }))
    );
    const insight = buildBodyInsight30dReport({
      preList: preRows.map((r) => ({
        date: formatDateOnly(r.date),
        sleep: r.sleep,
        fatigue: r.fatigue,
        soreness: r.soreness,
        stress: r.stress,
      })),
      postList: postRows.map((r) => ({
        date: formatDateOnly(r.date),
        sessionLoad: r.sessionLoad,
      })),
      painList,
    });

    return {
      success: true,
      hits,
      speedRecords,
      sessionCount,
      latestStatus,
      injuryCases,
      insight,
    };
  } catch (error) {
    console.error("数据库写入失败的完整原因:", error);
    return { success: false, error: errorMessage(error) };
  }
}
