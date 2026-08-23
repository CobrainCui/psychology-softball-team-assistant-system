"use server";

import { prisma } from "@/lib/db";
import {
  READINESS_DRAFT_SCHEMA_VERSION,
  type ReadinessHistoryEntry,
} from "@/lib/readinessHistory";
import {
  PRE_RULE_VERSION,
  buildPreFeedback,
  type PreQuadrant,
} from "@/lib/clinical/preQuadrant";
import { clampScale5, type Scale5 } from "@/lib/clinical/preDimensions";
import { parseDateOnly, formatDateOnly } from "@/lib/dateOnly";
import type { ActionResult } from "@/lib/actionResult";
import type { CycleConfidence, CyclePhaseCode } from "@/lib/clinical/cyclePhase";
import type { PhysiologicalLoadTag } from "@/lib/clinical/physiologicalLoad";
import type { CycleEnergyLevel, CycleMoodLevel } from "@/lib/cycleTypes";
import { buildCycleAssessmentBundle } from "@/lib/clinical/buildCycleAssessment";
import { loadCycleProfileDto } from "@/lib/cycleProfileLoad";
import {
  asCycleEnergy,
  asCycleMood,
  clampScore0to10,
  errorMessage,
  rejectIfNotToday,
} from "@/lib/status/shared";
import { requireOwnDataWriter, requireApprovedSession } from "@/lib/auth/actionGuard";

export type SaveReadinessPayload = {
  date: string;
  sleep: number;
  stress: number;
  fatigue: number;
  soreness: number;
  willingness: number;
  physicalBattery: number;
  mentalDrive: number;
  quadrant: PreQuadrant;
  cycleDay?: number | null;
  cyclePhaseCode?: CyclePhaseCode | null;
  cycleConfidence?: CycleConfidence | null;
  physiologicalLoadTag?: PhysiologicalLoadTag | null;
  crampsScore?: number | null;
  cycleEnergy?: CycleEnergyLevel | null;
  cycleMood?: CycleMoodLevel | null;
  cycleIrregularFlag?: boolean;
};

export async function saveReadinessAssessment(
  payload: SaveReadinessPayload
): Promise<ActionResult> {
  try {
    const gate = await requireOwnDataWriter();
    if (!gate.success) return gate;
    const playerId = gate.playerId;

    const dayErr = rejectIfNotToday(payload.date, gate.ctx.teamTimeZone);
    if (dayErr) return dayErr;
    const sleep = clampScale5(payload.sleep);
    const stress = clampScale5(payload.stress);
    const fatigue = clampScale5(payload.fatigue);
    const soreness = clampScale5(payload.soreness);
    const willingness = clampScale5(payload.willingness);
    if (!sleep || !stress || !fatigue || !soreness || !willingness) {
      return { success: false, error: "五维须为 1–5" };
    }

    // 推导步骤：五维钳制后用 pre_quadrant_v1 重算 X/Y/象限，不信任客户端
    const feedback = buildPreFeedback({
      input: { sleep, stress, fatigue, soreness, willingness },
    });

    const player = await prisma.player.findUnique({
      where: { id: playerId },
      select: { id: true },
    });
    if (!player) return { success: false, error: "云端无此队员" };

    const date = parseDateOnly(payload.date);
    const crampsScore = clampScore0to10(payload.crampsScore ?? undefined);
    const cycleEnergy = asCycleEnergy(payload.cycleEnergy);
    const cycleMood = asCycleMood(payload.cycleMood);
    const cycleIrregularFlag = Boolean(payload.cycleIrregularFlag);

    // 推导步骤：阶段/负荷按队时区日 + CycleProfile 重算，不信任客户端标签
    const profile = await loadCycleProfileDto(player.id);
    const recent = await prisma.readinessCheck.findMany({
      where: { playerId: player.id },
      orderBy: { date: "desc" },
      take: 30,
      select: { sleep: true, fatigue: true },
    });
    const cycleBundle = buildCycleAssessmentBundle({
      profile,
      periodStartDate: profile?.lastPeriodStart ?? "",
      symptoms: {
        crampsScore: crampsScore ?? 0,
        cycleEnergy,
        cycleMood,
        cycleIrregular: cycleIrregularFlag,
      },
      fatigueScore: fatigue,
      sorenessScore: soreness,
      recentSleep: recent.map((row) => row.sleep),
      recentFatigue: recent.map((row) => row.fatigue),
      asOfDateStr: payload.date,
    });

    const data = {
      sleep,
      stress,
      fatigue,
      soreness,
      willingness,
      physicalBattery: feedback.physicalBattery,
      mentalDrive: feedback.mentalDrive,
      quadrant: feedback.quadrant,
      ruleVersion: PRE_RULE_VERSION,
      cycleDay: cycleBundle.phase?.dayOfCycle ?? null,
      cyclePhaseCode: cycleBundle.phase?.hidePhaseLabels
        ? null
        : (cycleBundle.phase?.code ?? null),
      cycleConfidence: cycleBundle.phase?.confidence ?? null,
      physiologicalLoadTag: cycleBundle.loadTag,
      crampsScore,
      cycleEnergy,
      cycleMood,
      cycleIrregularFlag,
    };

    await prisma.readinessCheck.upsert({
      where: { playerId_date: { playerId: player.id, date } },
      create: {
        player: { connect: { id: player.id } },
        date,
        ...data,
      },
      update: data,
    });
    return { success: true };
  } catch (error) {
    console.error("数据库写入失败的完整原因:", error);
    return { success: false, error: errorMessage(error) };
  }
}

export async function deleteReadinessAssessment(payload: {
  date: string;
}): Promise<ActionResult> {
  try {
    const gate = await requireOwnDataWriter();
    if (!gate.success) return gate;

    const dayErr = rejectIfNotToday(payload.date, gate.ctx.teamTimeZone);
    if (dayErr) return dayErr;

    const existing = await prisma.readinessCheck.findUnique({
      where: {
        playerId_date: {
          playerId: gate.playerId,
          date: parseDateOnly(payload.date),
        },
      },
    });
    if (!existing) return { success: false, error: "没有今日评估记录" };

    await prisma.readinessCheck.delete({ where: { id: existing.id } });
    return { success: true };
  } catch (error) {
    console.error("数据库写入失败的完整原因:", error);
    return { success: false, error: errorMessage(error) };
  }
}

export async function getReadinessHistory(): Promise<
  ActionResult<{ history: ReadinessHistoryEntry[] }>
> {
  try {
    const gate = await requireApprovedSession();
    if (!gate.success) return gate;

    const rows = await prisma.readinessCheck.findMany({
      where: { playerId: gate.playerId },
      orderBy: { date: "desc" },
    });
    const history: ReadinessHistoryEntry[] = rows.map((row) => ({
      playerId: row.playerId,
      date: formatDateOnly(row.date),
      sleep: row.sleep as Scale5,
      stress: row.stress as Scale5,
      fatigue: row.fatigue as Scale5,
      soreness: row.soreness as Scale5,
      willingness: row.willingness as Scale5,
      physicalBattery: row.physicalBattery,
      mentalDrive: row.mentalDrive,
      quadrant: row.quadrant,
      schemaVersion: READINESS_DRAFT_SCHEMA_VERSION,
      cycleDay: row.cycleDay,
      cyclePhaseCode: row.cyclePhaseCode,
      cycleConfidence: row.cycleConfidence,
      physiologicalLoadTag: row.physiologicalLoadTag,
      crampsScore: row.crampsScore,
      cycleEnergy: row.cycleEnergy,
      cycleMood: row.cycleMood,
      cycleIrregularFlag: row.cycleIrregularFlag,
    }));
    return { success: true, history };
  } catch (error) {
    console.error("数据库写入失败的完整原因:", error);
    return { success: false, error: errorMessage(error) };
  }
}
