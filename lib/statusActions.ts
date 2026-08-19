"use server";

import { prisma } from "@/lib/db";
import {
  type HitQuality,
  type HitRecord,
  type HitResult,
  type PitchType,
  type SpeedRecord,
} from "@/lib/gameArchive";
import { getTodayDateStr, type ReadinessHistoryEntry } from "@/lib/readinessHistory";
import { PAIN_AREA_LABEL, isPainArea, type PainArea } from "@/lib/clinical/painAreas";
import {
  PRE_RULE_VERSION,
  QUADRANT_LABEL,
  type PreQuadrant,
} from "@/lib/clinical/preQuadrant";
import { clampScale5, type Scale5 } from "@/lib/clinical/preDimensions";
import {
  activityTypeLabel,
  computeSessionLoad,
  isActivityType,
  type ActivityType,
} from "@/lib/clinical/activityTypes";
import {
  buildPostSaveFeedback,
  type PostSaveFeedbackView,
  type PostSessionRow,
} from "@/lib/clinical/postSaveFeedback";
import { computeCasePainTrend, type CasePainTrendView } from "@/lib/clinical/injuryTrend";
import {
  buildBodyInsight30dReport,
  type BodyInsight30dReport,
} from "@/lib/clinical/bodyInsight30d";
import {
  isInjuryKind,
  isPainExerciseRelation,
  type InjuryCaseStatus,
  type InjuryKind,
  type InjuryNoteKind,
  type PainExerciseRelationId,
} from "@/lib/clinical/injuryKinds";
import { SESSION_FEEDBACK_SCHEMA_VERSION } from "@/lib/sessionFeedback";
import { parseDateOnly, formatDateOnly } from "@/lib/dateOnly";
import {
  LOAD_TAG_COACH_HINT,
  LOAD_TAG_LABEL,
  type PhysiologicalLoadTag,
} from "@/lib/clinical/physiologicalLoad";
import type {
  CycleConfidence,
  CyclePhaseCode,
} from "@/lib/clinical/cyclePhase";
import type {
  CycleEnergyLevel,
  CycleMoodLevel,
} from "@/lib/cycleTypes";

export type ActionOk<T extends object = object> = { success: true } & T;
export type ActionErr = { success: false; error: string };
export type ActionResult<T extends object = object> = ActionOk<T> | ActionErr;

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return String(error);
}

const QUADRANTS = new Set<PreQuadrant>([
  "slack",
  "real_fatigue",
  "injury_risk",
  "peak",
]);

function asPainArea(value: unknown): PainArea | null {
  return isPainArea(value) ? value : null;
}

function clampScore0to10(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(10, Math.round(value)));
}

function asQuadrant(value: unknown): PreQuadrant | null {
  return typeof value === "string" && QUADRANTS.has(value as PreQuadrant)
    ? (value as PreQuadrant)
    : null;
}

const CYCLE_ENERGY_LEVELS = new Set<CycleEnergyLevel>(["low", "mid", "high"]);
const CYCLE_MOOD_LEVELS = new Set<CycleMoodLevel>(["steady", "irritable", "low"]);
const CYCLE_PHASE_CODES = new Set<CyclePhaseCode>([
  "menstrual",
  "follicular",
  "ovulation",
  "luteal",
  "late_luteal",
]);
const CYCLE_CONFIDENCES = new Set<CycleConfidence>(["low", "medium", "high"]);
const LOAD_TAGS = new Set<PhysiologicalLoadTag>([
  "recover_high",
  "acl_caution",
  "maintain",
  "peak_ok",
  "monitor_health",
]);

function asCycleEnergy(value: unknown): CycleEnergyLevel | null {
  return typeof value === "string" && CYCLE_ENERGY_LEVELS.has(value as CycleEnergyLevel)
    ? (value as CycleEnergyLevel)
    : null;
}
function asCycleMood(value: unknown): CycleMoodLevel | null {
  return typeof value === "string" && CYCLE_MOOD_LEVELS.has(value as CycleMoodLevel)
    ? (value as CycleMoodLevel)
    : null;
}
function asCyclePhaseCode(value: unknown): CyclePhaseCode | null {
  return typeof value === "string" && CYCLE_PHASE_CODES.has(value as CyclePhaseCode)
    ? (value as CyclePhaseCode)
    : null;
}
function asCycleConfidence(value: unknown): CycleConfidence | null {
  return typeof value === "string" && CYCLE_CONFIDENCES.has(value as CycleConfidence)
    ? (value as CycleConfidence)
    : null;
}
function asLoadTag(value: unknown): PhysiologicalLoadTag | null {
  return typeof value === "string" && LOAD_TAGS.has(value as PhysiologicalLoadTag)
    ? (value as PhysiologicalLoadTag)
    : null;
}

export type InjuryPainLogDto = {
  id: string;
  date: string;
  painScore: number;
  painExerciseRelations: PainExerciseRelationId[];
  note: string | null;
  createdAt: string;
};

export type InjuryNoteDto = {
  id: string;
  kind: InjuryNoteKind;
  date: string;
  content: string;
  createdAt: string;
};

export type InjuryCaseDto = {
  id: string;
  playerId: string;
  painArea: PainArea;
  painAreaLabel: string;
  locationHint: string;
  injuryKind: InjuryKind;
  status: InjuryCaseStatus;
  startDate: string;
  recoveredAt: string | null;
  parentCaseId: string | null;
  painLogs: InjuryPainLogDto[];
  notes: InjuryNoteDto[];
  latestPain: number | null;
  trend: CasePainTrendView;
};

type CaseRow = {
  id: string;
  playerId: string;
  painArea: PainArea;
  locationHint: string;
  injuryKind: InjuryKind;
  status: InjuryCaseStatus;
  startDate: Date;
  recoveredAt: Date | null;
  parentCaseId: string | null;
  painLogs: {
    id: string;
    date: Date;
    painScore: number;
    painExerciseRelations: string[];
    note: string | null;
    createdAt: Date;
  }[];
  notes: {
    id: string;
    kind: InjuryNoteKind;
    date: Date;
    content: string;
    createdAt: Date;
  }[];
};

function mapCase(row: CaseRow): InjuryCaseDto {
  const painLogs: InjuryPainLogDto[] = row.painLogs
    .slice()
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .map((log) => ({
      id: log.id,
      date: formatDateOnly(log.date),
      painScore: log.painScore,
      painExerciseRelations: log.painExerciseRelations.filter(isPainExerciseRelation),
      note: log.note,
      createdAt: log.createdAt.toISOString(),
    }));
  const notes: InjuryNoteDto[] = row.notes
    .slice()
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .map((n) => ({
      id: n.id,
      kind: n.kind,
      date: formatDateOnly(n.date),
      content: n.content,
      createdAt: n.createdAt.toISOString(),
    }));
  const latestPain =
    painLogs.length > 0 ? painLogs[painLogs.length - 1]!.painScore : null;
  return {
    id: row.id,
    playerId: row.playerId,
    painArea: row.painArea,
    painAreaLabel: PAIN_AREA_LABEL[row.painArea],
    locationHint: row.locationHint,
    injuryKind: row.injuryKind,
    status: row.status,
    startDate: formatDateOnly(row.startDate),
    recoveredAt: row.recoveredAt ? formatDateOnly(row.recoveredAt) : null,
    parentCaseId: row.parentCaseId,
    painLogs,
    notes,
    latestPain,
    trend: computeCasePainTrend({
      painArea: row.painArea,
      painLogs: painLogs.map((l) => ({
        date: l.date,
        painScore: l.painScore,
        createdAt: l.createdAt,
      })),
    }),
  };
}

const caseInclude = {
  painLogs: true,
  notes: true,
} as const;

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

export async function getPlayerProfileData(
  playerId: string
): Promise<
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
    if (typeof playerId !== "string" || !playerId.trim()) {
      return { success: false, error: "playerId 无效" };
    }

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

export type SaveReadinessPayload = {
  playerId: string;
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
    if (typeof payload.playerId !== "string" || !payload.playerId.trim()) {
      return { success: false, error: "playerId 无效" };
    }
    if (
      typeof payload.date !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(payload.date)
    ) {
      return { success: false, error: "date 须为 YYYY-MM-DD" };
    }
    const sleep = clampScale5(payload.sleep);
    const stress = clampScale5(payload.stress);
    const fatigue = clampScale5(payload.fatigue);
    const soreness = clampScale5(payload.soreness);
    const willingness = clampScale5(payload.willingness);
    if (!sleep || !stress || !fatigue || !soreness || !willingness) {
      return { success: false, error: "五维须为 1–5" };
    }
    const quadrant = asQuadrant(payload.quadrant);
    if (!quadrant) return { success: false, error: "quadrant 无效" };
    if (
      typeof payload.physicalBattery !== "number" ||
      !Number.isFinite(payload.physicalBattery)
    ) {
      return { success: false, error: "physicalBattery 无效" };
    }

    const player = await prisma.player.findUnique({
      where: { id: payload.playerId },
      select: { id: true },
    });
    if (!player) return { success: false, error: "云端无此队员" };

    const date = parseDateOnly(payload.date);
    const data = {
      sleep,
      stress,
      fatigue,
      soreness,
      willingness,
      physicalBattery: payload.physicalBattery,
      mentalDrive: willingness,
      quadrant,
      ruleVersion: PRE_RULE_VERSION,
      cycleDay:
        typeof payload.cycleDay === "number" && Number.isFinite(payload.cycleDay)
          ? Math.round(payload.cycleDay)
          : null,
      cyclePhaseCode: asCyclePhaseCode(payload.cyclePhaseCode),
      cycleConfidence: asCycleConfidence(payload.cycleConfidence),
      physiologicalLoadTag: asLoadTag(payload.physiologicalLoadTag),
      crampsScore: clampScore0to10(payload.crampsScore ?? undefined),
      cycleEnergy: asCycleEnergy(payload.cycleEnergy),
      cycleMood: asCycleMood(payload.cycleMood),
      cycleIrregularFlag: Boolean(payload.cycleIrregularFlag),
    };

    console.log(
      "即将送入 Prisma 的数据:",
      JSON.stringify({ playerId: player.id, date: payload.date, ...data }, null, 2)
    );

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

export async function getReadinessHistory(
  playerId: string
): Promise<ActionResult<{ history: ReadinessHistoryEntry[] }>> {
  try {
    if (typeof playerId !== "string" || !playerId.trim()) {
      return { success: false, error: "playerId 无效" };
    }
    const rows = await prisma.readinessCheck.findMany({
      where: { playerId },
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
    }));
    return { success: true, history };
  } catch (error) {
    console.error("数据库写入失败的完整原因:", error);
    return { success: false, error: errorMessage(error) };
  }
}

export async function getInjuryCases(
  playerId: string
): Promise<ActionResult<{ cases: InjuryCaseDto[] }>> {
  try {
    if (typeof playerId !== "string" || !playerId.trim()) {
      return { success: false, error: "playerId 无效" };
    }
    const rows = await prisma.injuryCase.findMany({
      where: { playerId },
      include: caseInclude,
      orderBy: { updatedAt: "desc" },
    });
    return { success: true, cases: rows.map((row) => mapCase(row as CaseRow)) };
  } catch (error) {
    console.error("数据库写入失败的完整原因:", error);
    return { success: false, error: errorMessage(error) };
  }
}

export type CreateInjuryCasePayload = {
  playerId: string;
  painArea: PainArea;
  locationHint?: string;
  injuryKind: InjuryKind;
  startDate: string;
  painScore: number;
  painExerciseRelations: PainExerciseRelationId[];
  note?: string | null;
  parentCaseId?: string | null;
};

export async function createInjuryCase(
  payload: CreateInjuryCasePayload
): Promise<ActionResult<{ injuryCase: InjuryCaseDto }>> {
  try {
    if (typeof payload.playerId !== "string" || !payload.playerId.trim()) {
      return { success: false, error: "playerId 无效" };
    }
    const painArea = asPainArea(payload.painArea);
    if (!painArea) return { success: false, error: "painArea 无效" };
    if (!isInjuryKind(payload.injuryKind)) {
      return { success: false, error: "injuryKind 无效" };
    }
    if (
      typeof payload.startDate !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(payload.startDate)
    ) {
      return { success: false, error: "startDate 须为 YYYY-MM-DD" };
    }
    const painScore = clampScore0to10(payload.painScore);
    if (painScore === null) return { success: false, error: "painScore 无效" };

    const player = await prisma.player.findUnique({
      where: { id: payload.playerId },
      select: { id: true },
    });
    if (!player) return { success: false, error: "云端无此队员" };

    const relations = (payload.painExerciseRelations ?? []).filter(
      isPainExerciseRelation
    );
    const startDate = parseDateOnly(payload.startDate);
    const row = await prisma.injuryCase.create({
      data: {
        player: { connect: { id: player.id } },
        schemaVersion: 2,
        painArea,
        locationHint: (payload.locationHint ?? "").trim().slice(0, 80),
        injuryKind: payload.injuryKind,
        status: "active",
        startDate,
        ...(payload.parentCaseId
          ? { parent: { connect: { id: payload.parentCaseId } } }
          : {}),
        painLogs: {
          create: {
            date: startDate,
            painScore,
            painExerciseRelations: relations,
            note: payload.note?.trim().slice(0, 200) || null,
          },
        },
      },
      include: caseInclude,
    });
    return { success: true, injuryCase: mapCase(row) };
  } catch (error) {
    console.error("数据库写入失败的完整原因:", error);
    return { success: false, error: errorMessage(error) };
  }
}

export type AddInjuryPainLogPayload = {
  playerId: string;
  caseId: string;
  date: string;
  painScore: number;
  painExerciseRelations: PainExerciseRelationId[];
  note?: string | null;
};

export async function addInjuryPainLog(
  payload: AddInjuryPainLogPayload
): Promise<ActionResult<{ injuryCase: InjuryCaseDto }>> {
  try {
    const painScore = clampScore0to10(payload.painScore);
    if (painScore === null) return { success: false, error: "painScore 无效" };
    if (
      typeof payload.date !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(payload.date)
    ) {
      return { success: false, error: "date 须为 YYYY-MM-DD" };
    }
    const existing = await prisma.injuryCase.findFirst({
      where: { id: payload.caseId, playerId: payload.playerId },
    });
    if (!existing) return { success: false, error: "找不到该损伤记录" };
    if (existing.status !== "active") {
      return { success: false, error: "已康复记录请走复发" };
    }
    const date = parseDateOnly(payload.date);
    await prisma.injuryPainLog.create({
      data: {
        injuryCase: { connect: { id: existing.id } },
        date,
        painScore,
        painExerciseRelations: (payload.painExerciseRelations ?? []).filter(
          isPainExerciseRelation
        ),
        note: payload.note?.trim().slice(0, 200) || null,
      },
    });
    const row = await prisma.injuryCase.findUnique({
      where: { id: existing.id },
      include: caseInclude,
    });
    if (!row) return { success: false, error: "写入后读取失败" };
    return { success: true, injuryCase: mapCase(row as CaseRow) };
  } catch (error) {
    console.error("数据库写入失败的完整原因:", error);
    return { success: false, error: errorMessage(error) };
  }
}

export type AddInjuryNotePayload = {
  playerId: string;
  caseId: string;
  kind: InjuryNoteKind;
  date: string;
  content: string;
};

export async function addInjuryNote(
  payload: AddInjuryNotePayload
): Promise<ActionResult<{ injuryCase: InjuryCaseDto }>> {
  try {
    if (payload.kind !== "treatment" && payload.kind !== "rehab") {
      return { success: false, error: "kind 无效" };
    }
    const content = typeof payload.content === "string" ? payload.content.trim() : "";
    if (!content) return { success: false, error: "备注不能为空" };
    if (
      typeof payload.date !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(payload.date)
    ) {
      return { success: false, error: "date 须为 YYYY-MM-DD" };
    }
    const existing = await prisma.injuryCase.findFirst({
      where: { id: payload.caseId, playerId: payload.playerId },
    });
    if (!existing) return { success: false, error: "找不到该损伤记录" };
    await prisma.injuryNoteRecord.create({
      data: {
        injuryCase: { connect: { id: existing.id } },
        kind: payload.kind,
        date: parseDateOnly(payload.date),
        content: content.slice(0, 500),
      },
    });
    const row = await prisma.injuryCase.findUnique({
      where: { id: existing.id },
      include: caseInclude,
    });
    if (!row) return { success: false, error: "写入后读取失败" };
    return { success: true, injuryCase: mapCase(row as CaseRow) };
  } catch (error) {
    console.error("数据库写入失败的完整原因:", error);
    return { success: false, error: errorMessage(error) };
  }
}

export async function markInjuryRecovered(payload: {
  playerId: string;
  caseId: string;
  recoveredAt?: string;
}): Promise<ActionResult<{ injuryCase: InjuryCaseDto }>> {
  try {
    const existing = await prisma.injuryCase.findFirst({
      where: { id: payload.caseId, playerId: payload.playerId },
    });
    if (!existing) return { success: false, error: "找不到该损伤记录" };
    const recoveredAt =
      typeof payload.recoveredAt === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(payload.recoveredAt)
        ? parseDateOnly(payload.recoveredAt)
        : parseDateOnly(getTodayDateStr());
    const row = await prisma.injuryCase.update({
      where: { id: existing.id },
      data: { status: "recovered", recoveredAt },
      include: caseInclude,
    });
    return { success: true, injuryCase: mapCase(row as CaseRow) };
  } catch (error) {
    console.error("数据库写入失败的完整原因:", error);
    return { success: false, error: errorMessage(error) };
  }
}

export type SaveSessionFeedbackPayload = {
  playerId: string;
  date: string;
  activityType: ActivityType;
  sessionRpe: number;
  durationMin: number;
  note: string | null;
};

export type SessionFeedbackSaved = {
  id: string;
  date: string;
  activityType: ActivityType;
  sessionRpe: number;
  durationMin: number;
  sessionLoad: number;
  note: string | null;
};

export async function saveSessionFeedback(
  payload: SaveSessionFeedbackPayload
): Promise<
  ActionResult<{
    entry: SessionFeedbackSaved;
    view: PostSaveFeedbackView;
  }>
> {
  try {
    if (typeof payload.playerId !== "string" || !payload.playerId.trim()) {
      return { success: false, error: "playerId 无效" };
    }
    if (
      typeof payload.date !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(payload.date)
    ) {
      return { success: false, error: "date 须为 YYYY-MM-DD" };
    }
    const sessionRpe = clampScore0to10(payload.sessionRpe);
    if (sessionRpe === null || sessionRpe < 1) {
      return { success: false, error: "sessionRpe 须为 1–10" };
    }
    if (
      typeof payload.durationMin !== "number" ||
      !Number.isFinite(payload.durationMin) ||
      payload.durationMin < 1 ||
      payload.durationMin > 360
    ) {
      return { success: false, error: "durationMin 须为 1–360" };
    }
    const activityType = isActivityType(payload.activityType)
      ? payload.activityType
      : "other";
    const noteRaw = typeof payload.note === "string" ? payload.note.trim() : "";
    const note = noteRaw ? noteRaw.slice(0, 200) : null;

    const player = await prisma.player.findUnique({
      where: { id: payload.playerId },
      select: { id: true },
    });
    if (!player) return { success: false, error: "云端无此队员" };

    const date = parseDateOnly(payload.date);
    const durationMin = Math.round(payload.durationMin);
    const sessionLoad = computeSessionLoad(sessionRpe, durationMin);

    const created = await prisma.sessionFeedback.create({
      data: {
        player: { connect: { id: player.id } },
        date,
        schemaVersion: SESSION_FEEDBACK_SCHEMA_VERSION,
        activityType,
        sessionRpe,
        durationMin,
        sessionLoad,
        note,
      },
    });

    const [allPosts, todayPre, activeCases] = await Promise.all([
      prisma.sessionFeedback.findMany({
        where: { playerId: player.id },
        orderBy: [{ date: "asc" }, { createdAt: "asc" }],
      }),
      prisma.readinessCheck.findUnique({
        where: { playerId_date: { playerId: player.id, date } },
      }),
      prisma.injuryCase.findMany({
        where: { playerId: player.id, status: "active" },
        select: { painArea: true },
      }),
    ]);

    const postRows: PostSessionRow[] = allPosts.map((row) => ({
      id: row.id,
      date: formatDateOnly(row.date),
      activityType: row.activityType,
      sessionRpe: row.sessionRpe,
      durationMin: row.durationMin,
      sessionLoad: row.sessionLoad,
      savedAt: row.createdAt.toISOString(),
    }));
    const savedPost = postRows.find((p) => p.id === created.id)!;
    const todaySessionCount = postRows.filter(
      (p) => p.date === payload.date
    ).length;
    const view = buildPostSaveFeedback({
      savedPost,
      allPosts: postRows,
      todaySessionCount,
      todayPhysicalBattery: todayPre?.physicalBattery ?? null,
      activeInjuries: activeCases,
    });

    return {
      success: true,
      entry: {
        id: created.id,
        date: payload.date,
        activityType,
        sessionRpe,
        durationMin,
        sessionLoad,
        note,
      },
      view,
    };
  } catch (error) {
    console.error("数据库写入失败的完整原因:", error);
    return { success: false, error: errorMessage(error) };
  }
}

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
  durationMin: number;
  sessionLoad: number;
  note: string | null;
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

export async function getCoachDaySummary(
  requesterPlayerId: string,
  dateStr?: string
): Promise<ActionResult<{ summary: CoachDaySummary }>> {
  try {
    if (typeof requesterPlayerId !== "string" || !requesterPlayerId.trim()) {
      return { success: false, error: "playerId 无效" };
    }
    const date =
      typeof dateStr === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)
        ? dateStr
        : getTodayDateStr();

    const requester = await prisma.player.findUnique({
      where: { id: requesterPlayerId },
      select: { id: true, role: true, teamId: true },
    });
    if (!requester) return { success: false, error: "云端无此队员" };
    if (requester.role !== "coach") {
      return { success: false, error: "仅教练可查看全队日摘要" };
    }

    const roster = await prisma.player.findMany({
      where: { teamId: requester.teamId },
      orderBy: { name: "asc" },
      select: { id: true, name: true, role: true },
    });
    const playerIds = roster.filter((p) => p.role !== "coach").map((p) => p.id);
    const nameById = new Map(roster.map((p) => [p.id, p.name]));
    const day = parseDateOnly(date);
    const [checks, feedbackRows, profiles, caseRows] = await Promise.all([
      prisma.readinessCheck.findMany({
        where: { playerId: { in: playerIds }, date: day },
      }),
      prisma.sessionFeedback.findMany({
        where: { playerId: { in: playerIds }, date: day },
        orderBy: { sessionLoad: "desc" },
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
        activityLabel: activityTypeLabel(row.activityType),
        sessionRpe: row.sessionRpe,
        durationMin: row.durationMin,
        sessionLoad: row.sessionLoad,
        note: row.note,
      })
    );

    return {
      success: true,
      summary: {
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
      },
    };
  } catch (error) {
    console.error("数据库写入失败的完整原因:", error);
    return { success: false, error: errorMessage(error) };
  }
}
