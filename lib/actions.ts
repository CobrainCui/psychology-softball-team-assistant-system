"use server";

import { prisma } from "@/lib/db";
import {
  GAME_ARCHIVE_SCHEMA_VERSION,
  type HitQuality,
  type HitRecord,
  type HitResult,
  type PitchType,
  type SpeedRecord,
} from "@/lib/gameArchive";
import {
  normalizePlayerRole,
  type Gender,
  type Player,
  type PlayerRole,
} from "@/lib/players";
import type { Assignments } from "@/lib/sessionDraft";
import {
  getTodayDateStr,
  type ProbeFeedback,
  type ReadinessHistoryEntry,
  type SleepQuality,
} from "@/lib/readinessHistory";
import {
  PAIN_AREA_LABEL,
  type PainArea,
} from "@/lib/clinical/painAreas";
import {
  deriveReadinessTier,
  type ReadinessTier,
} from "@/lib/clinical/readinessTier";
import {
  type CycleConfidence,
  type CyclePhaseCode,
} from "@/lib/clinical/cyclePhase";
import { resolveCycleLength } from "@/lib/clinical/cycleStats";
import {
  LOAD_TAG_COACH_HINT,
  LOAD_TAG_LABEL,
  type PhysiologicalLoadTag,
} from "@/lib/clinical/physiologicalLoad";
import {
  INJURY_LOG_SCHEMA_VERSION,
  type InjuryLogEntry,
} from "@/lib/injuryLog";
import { SESSION_FEEDBACK_SCHEMA_VERSION } from "@/lib/sessionFeedback";
import type {
  CycleEnergyLevel,
  CycleMoodLevel,
  CycleProfileDto,
  CycleSharingLevel,
} from "@/lib/cycleTypes";

export type {
  CycleEnergyLevel,
  CycleMoodLevel,
  CycleProfileDto,
  CycleSharingLevel,
} from "@/lib/cycleTypes";

const DEFAULT_TEAM_NAME = "心理学部队";

/** Server Action 统一结果：禁止靠 throw 驱动前端分支（易静默失败）
 *  - 有业务载荷：ActionResult<{ players: ... }>
 *  - 仅表示成功：ActionResult（默认 T=object，允许 { success: true }）
 *  - 禁止 ActionResult<Record<string, never>>：与 success 字段交叉后恒为 never
 */
export type ActionOk<T extends object = object> = { success: true } & T;
export type ActionErr = { success: false; error: string };
export type ActionResult<T extends object = object> = ActionOk<T> | ActionErr;

export type CloudPlayer = {
  id: string;
  name: string;
  gender: Gender | null;
  role: PlayerRole;
};

function toCloudPlayer(row: {
  id: string;
  name: string;
  gender: Gender | null;
  role: "player" | "coach";
}): CloudPlayer {
  return {
    id: row.id,
    name: row.name,
    gender: row.gender,
    role: normalizePlayerRole(row.role),
  };
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return String(error);
}

// 推导步骤：查最早一支球队 → 无则创建「心理学部队」
export async function getOrCreateDefaultTeam() {
  let team = await prisma.team.findFirst({ orderBy: { createdAt: "asc" } });
  if (!team) {
    team = await prisma.team.create({
      data: { name: DEFAULT_TEAM_NAME },
    });
  }
  return team;
}

// 推导步骤：确保默认球队存在 → 返回该队全部球员（按创建时间）
export async function getPlayers(): Promise<
  ActionResult<{ players: CloudPlayer[] }>
> {
  try {
    const team = await getOrCreateDefaultTeam();
    const rows = await prisma.player.findMany({
      where: { teamId: team.id },
      orderBy: { createdAt: "asc" },
    });
    return { success: true, players: rows.map(toCloudPlayer) };
  } catch (error) {
    console.error("数据库写入失败的完整原因:", error);
    return { success: false, error: errorMessage(error) };
  }
}

// 推导步骤：在默认队按姓名查找 → 有则返回 → 无则新建后返回
export async function loginOrRegister(
  name: string,
  gender: Gender,
  role: PlayerRole
): Promise<ActionResult<{ player: Player }>> {
  try {
    const trimmed = name.trim();
    if (!trimmed) {
      return { success: false, error: "姓名不能为空" };
    }

    const team = await getOrCreateDefaultTeam();
    const normalizedRole = normalizePlayerRole(role);

    const existing = await prisma.player.findFirst({
      where: { teamId: team.id, name: trimmed },
    });

    if (existing) {
      // 登录页所选角色/性别写回云端，避免一直停在旧 role 导致教练入口与摘要缺失
      const updated = await prisma.player.update({
        where: { id: existing.id },
        data: {
          role: normalizedRole,
          gender: existing.gender ?? gender,
        },
      });
      return {
        success: true,
        player: {
          id: updated.id,
          name: updated.name,
          gender: updated.gender ?? gender,
          role: normalizePlayerRole(updated.role),
        },
      };
    }

    const created = await prisma.player.create({
      data: {
        teamId: team.id,
        name: trimmed,
        gender,
        role: normalizedRole,
      },
    });

    return {
      success: true,
      player: {
        id: created.id,
        name: created.name,
        gender: created.gender ?? gender,
        role: normalizePlayerRole(created.role),
      },
    };
  } catch (error) {
    console.error("数据库写入失败的完整原因:", error);
    return { success: false, error: errorMessage(error) };
  }
}

export type SaveTestSessionPayload = {
  hits: HitRecord[];
  speedRecords: SpeedRecord[];
  assignments?: Assignments;
  testItems?: string[];
};

export type SaveTestSessionResult =
  | { success: true; id: string; gameId: number; date: string }
  | { success: false; error: string };

// 大联盟弹道字典：仅允许以下 result（拒绝旧版 1B/2B/3B/HR/OUT）
const ALLOWED_HIT_RESULTS = ["LD", "FB", "GB", "PU", "MISS"] as const;
const HIT_RESULTS = new Set<string>(ALLOWED_HIT_RESULTS);
const PITCH_TYPES = new Set<string>(["FB", "CB", "SL", "CH", "OT"]);
const HIT_QUALITIES = new Set<string>(["Hard", "Medium", "Soft"]);

function asHitResult(value: unknown): HitResult | null {
  return typeof value === "string" && HIT_RESULTS.has(value)
    ? (value as HitResult)
    : null;
}

function asPitchType(value: unknown): PitchType | null {
  return typeof value === "string" && PITCH_TYPES.has(value)
    ? (value as PitchType)
    : null;
}

function asHitQuality(value: unknown): HitQuality | null {
  return typeof value === "string" && HIT_QUALITIES.has(value)
    ? (value as HitQuality)
    : null;
}

function toFloatOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

// 推导步骤：逐字段手写映射（禁止 ...spread）→ 剔除 playerName/timestamp/id
// → connect Team/Player → 嵌套 create；失败把 error.message 回传前端
export async function saveTestSession(
  payload: SaveTestSessionPayload
): Promise<SaveTestSessionResult> {
  try {
    const hitsRaw = Array.isArray(payload.hits) ? payload.hits : [];
    const speedRaw = Array.isArray(payload.speedRecords)
      ? payload.speedRecords
      : [];

    if (hitsRaw.length === 0 && speedRaw.length === 0) {
      return { success: false, error: "归档内容为空" };
    }

    const team = await getOrCreateDefaultTeam();
    const archivedAt = new Date();

    // 仅 Schema 存在的字段；x/y 无效则为 null（禁止 NaN）
    const hitCreates = hitsRaw.map((hit, index) => {
      if (typeof hit.playerId !== "string" || !hit.playerId) {
        throw new Error(`第 ${index + 1} 条打点缺少 playerId`);
      }
      const result = asHitResult(hit.result);
      if (!result) {
        throw new Error(
          `第 ${index + 1} 条打点 result 无效: ${String(hit.result)}`
        );
      }
      return {
        player: { connect: { id: hit.playerId } },
        result,
        pitchType: asPitchType(hit.pitchType),
        hitQuality: asHitQuality(hit.hitQuality),
        x: toFloatOrNull(hit.x),
        y: toFloatOrNull(hit.y),
        // Schema 要求 recordedAt；用服务端时间，不吃前端 timestamp
        recordedAt: archivedAt,
      };
    });

    // Schema: firstBaseSeconds / secondBaseSeconds / customSeconds（无 toFirst 等别名）
    const speedCreates = speedRaw.map((row, index) => {
      if (typeof row.playerId !== "string" || !row.playerId) {
        throw new Error(`第 ${index + 1} 条测速缺少 playerId`);
      }
      return {
        player: { connect: { id: row.playerId } },
        firstBaseSeconds: toFloatOrNull(row.firstBaseSeconds),
        secondBaseSeconds: toFloatOrNull(row.secondBaseSeconds),
        customSeconds: toFloatOrNull(row.customSeconds),
        recordedAt: archivedAt,
      };
    });

    const playerIds = [
      ...new Set([
        ...hitsRaw.map((h) => h.playerId),
        ...speedRaw.map((s) => s.playerId),
      ]),
    ].filter((id): id is string => typeof id === "string" && id.length > 0);

    if (playerIds.length === 0) {
      return { success: false, error: "缺少有效的云端 playerId" };
    }

    const existing = await prisma.player.findMany({
      where: { teamId: team.id, id: { in: playerIds } },
      select: { id: true },
    });
    if (existing.length !== playerIds.length) {
      const known = new Set(existing.map((p) => p.id));
      const missing = playerIds.filter((id) => !known.has(id));
      return {
        success: false,
        error: `含未入册队员 id: ${missing.join(", ")}。请先登录页拉取云端名册后再测。`,
      };
    }

    const prismaData = {
      schemaVersion: GAME_ARCHIVE_SCHEMA_VERSION,
      archivedAt,
      team: { connect: { id: team.id } },
      hits: { create: hitCreates },
      speedRecords: { create: speedCreates },
    };

    console.log("即将送入 Prisma 的数据:", JSON.stringify(prismaData, null, 2));

    const session = await prisma.testSession.create({
      data: prismaData,
      select: { id: true, archivedAt: true },
    });

    return {
      success: true,
      id: session.id,
      gameId: session.archivedAt.getTime(),
      date: session.archivedAt.toISOString(),
    };
  } catch (error) {
    console.error("数据库写入失败的完整原因:", error);
    // 完整 error.message 回传前端（经 { success: false, error }，避免 throw 被边界吞掉）
    return { success: false, error: errorMessage(error) };
  }
}

// 推导步骤：按 playerId 拉 Hit / SpeedRecord / InjuryLog / 最近 Readiness → 手写映射
export async function getPlayerProfileData(
  playerId: string
): Promise<
  ActionResult<{
    hits: HitRecord[];
    speedRecords: SpeedRecord[];
    sessionCount: number;
    injuryLogs: InjuryLogEntry[];
    latestReadiness: number | null;
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

    const [hitRows, speedRows, injuryRows, latestCheck] = await Promise.all([
      prisma.hit.findMany({
        where: { playerId: player.id },
        orderBy: { recordedAt: "asc" },
      }),
      prisma.speedRecord.findMany({
        where: { playerId: player.id },
        orderBy: { recordedAt: "asc" },
      }),
      prisma.injuryLog.findMany({
        where: { playerId: player.id },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
      prisma.readinessCheck.findFirst({
        where: { playerId: player.id },
        orderBy: { date: "desc" },
        select: { readinessScore: true },
      }),
    ]);

    const hits: HitRecord[] = hitRows.map((hit) => ({
      id: hit.id,
      x: hit.x ?? undefined,
      y: hit.y ?? undefined,
      result: hit.result,
      playerId: hit.playerId,
      playerName: player.name,
      pitchType: hit.pitchType ?? undefined,
      hitQuality: hit.hitQuality ?? undefined,
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

    const injuryLogs: InjuryLogEntry[] = injuryRows.map((row) => ({
      schemaVersion: row.schemaVersion,
      id: row.id,
      playerId: row.playerId,
      playerName: player.name,
      painArea: row.painArea,
      painAreaLabel: PAIN_AREA_LABEL[row.painArea],
      painScore: row.painScore,
      symptom: row.symptom,
      timestamp: row.createdAt.getTime(),
    }));

    return {
      success: true,
      hits,
      speedRecords,
      sessionCount,
      injuryLogs,
      latestReadiness: latestCheck?.readinessScore ?? null,
    };
  } catch (error) {
    console.error("数据库写入失败的完整原因:", error);
    return { success: false, error: errorMessage(error) };
  }
}

const PAIN_AREAS = new Set<string>([
  "shoulder",
  "elbow",
  "lumbar",
  "knee",
  "ankle",
  "wrist",
]);
const PROBE_FEEDBACKS = new Set<string>(["A", "B", "C"]);
const SLEEP_QUALITIES = new Set<string>(["good", "normal", "bad"]);

function asPainArea(value: unknown): PainArea | null {
  return typeof value === "string" && PAIN_AREAS.has(value)
    ? (value as PainArea)
    : null;
}

function asProbeFeedback(value: unknown): ProbeFeedback | null {
  return typeof value === "string" && PROBE_FEEDBACKS.has(value)
    ? (value as ProbeFeedback)
    : null;
}

function asSleepQuality(value: unknown): SleepQuality | null {
  return typeof value === "string" && SLEEP_QUALITIES.has(value)
    ? (value as SleepQuality)
    : null;
}

function clampScore0to10(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(10, Math.round(value)));
}

function parseDateOnly(dateStr: string): Date {
  // 正午 UTC，避免时区把 YYYY-MM-DD 推到前一天
  return new Date(`${dateStr}T12:00:00.000Z`);
}

function formatDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export type SaveReadinessPayload = {
  playerId: string;
  date: string;
  readinessScore: number;
  hasNewInjury: boolean;
  injuryPart: PainArea | null;
  injuryScore: number;
  probeFeedback: ProbeFeedback | null;
  sleepQuality?: string;
  stressScore?: number;
  fatigueScore?: number;
  sorenessScore?: number;
  /** 生理周期快照（可选） */
  cycleDay?: number | null;
  cyclePhaseCode?: CyclePhaseCode | null;
  cycleConfidence?: CycleConfidence | null;
  physiologicalLoadTag?: PhysiologicalLoadTag | null;
  crampsScore?: number | null;
  cycleEnergy?: CycleEnergyLevel | null;
  cycleMood?: CycleMoodLevel | null;
  cycleIrregularFlag?: boolean;
};

const CYCLE_SHARING_LEVELS = new Set<CycleSharingLevel>([
  "none",
  "load_only",
  "phase_label",
]);
const CYCLE_ENERGY_LEVELS = new Set<CycleEnergyLevel>(["low", "mid", "high"]);
const CYCLE_MOOD_LEVELS = new Set<CycleMoodLevel>([
  "steady",
  "irritable",
  "low",
]);
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

function asCycleSharingLevel(value: unknown): CycleSharingLevel | null {
  return typeof value === "string" &&
    CYCLE_SHARING_LEVELS.has(value as CycleSharingLevel)
    ? (value as CycleSharingLevel)
    : null;
}

function asCycleEnergy(value: unknown): CycleEnergyLevel | null {
  return typeof value === "string" &&
    CYCLE_ENERGY_LEVELS.has(value as CycleEnergyLevel)
    ? (value as CycleEnergyLevel)
    : null;
}

function asCycleMood(value: unknown): CycleMoodLevel | null {
  return typeof value === "string" &&
    CYCLE_MOOD_LEVELS.has(value as CycleMoodLevel)
    ? (value as CycleMoodLevel)
    : null;
}

function asCyclePhaseCode(value: unknown): CyclePhaseCode | null {
  return typeof value === "string" &&
    CYCLE_PHASE_CODES.has(value as CyclePhaseCode)
    ? (value as CyclePhaseCode)
    : null;
}

function asCycleConfidence(value: unknown): CycleConfidence | null {
  return typeof value === "string" &&
    CYCLE_CONFIDENCES.has(value as CycleConfidence)
    ? (value as CycleConfidence)
    : null;
}

function asLoadTag(value: unknown): PhysiologicalLoadTag | null {
  return typeof value === "string" &&
    LOAD_TAGS.has(value as PhysiologicalLoadTag)
    ? (value as PhysiologicalLoadTag)
    : null;
}

export type SaveInjuryLogPayload = {
  playerId: string;
  painArea: PainArea;
  painScore: number;
  symptom: string;
};

// 推导步骤：校验 playerId/date/枚举 → upsert ReadinessCheck（含 Wellness 原值）
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
    if (
      typeof payload.readinessScore !== "number" ||
      !Number.isFinite(payload.readinessScore)
    ) {
      return { success: false, error: "readinessScore 无效" };
    }

    const player = await prisma.player.findUnique({
      where: { id: payload.playerId },
      select: { id: true },
    });
    if (!player) {
      return { success: false, error: "云端无此队员" };
    }

    const injuryPart = asPainArea(payload.injuryPart);
    const probeFeedback = asProbeFeedback(payload.probeFeedback);
    const sleepQuality = asSleepQuality(payload.sleepQuality);
    const stressScore = clampScore0to10(payload.stressScore);
    const fatigueScore = clampScore0to10(payload.fatigueScore);
    const sorenessScore = clampScore0to10(payload.sorenessScore);
    const injuryScore =
      typeof payload.injuryScore === "number" &&
      Number.isFinite(payload.injuryScore)
        ? Math.round(payload.injuryScore)
        : 0;
    const crampsScore = clampScore0to10(payload.crampsScore ?? undefined);
    const cycleEnergy = asCycleEnergy(payload.cycleEnergy);
    const cycleMood = asCycleMood(payload.cycleMood);
    const cyclePhaseCode = asCyclePhaseCode(payload.cyclePhaseCode);
    const cycleConfidence = asCycleConfidence(payload.cycleConfidence);
    const physiologicalLoadTag = asLoadTag(payload.physiologicalLoadTag);
    const cycleDay =
      typeof payload.cycleDay === "number" && Number.isFinite(payload.cycleDay)
        ? Math.round(payload.cycleDay)
        : null;

    const date = parseDateOnly(payload.date);
    const data = {
      readinessScore: Math.round(payload.readinessScore),
      hasNewInjury: Boolean(payload.hasNewInjury),
      injuryPart,
      injuryScore,
      probeFeedback,
      sleepQuality,
      stressScore,
      fatigueScore,
      sorenessScore,
      cycleDay,
      cyclePhaseCode,
      cycleConfidence,
      physiologicalLoadTag,
      crampsScore,
      cycleEnergy,
      cycleMood,
      cycleIrregularFlag: Boolean(payload.cycleIrregularFlag),
    };

    console.log(
      "即将送入 Prisma 的数据:",
      JSON.stringify({ playerId: player.id, date: payload.date, ...data }, null, 2)
    );

    await prisma.readinessCheck.upsert({
      where: {
        playerId_date: {
          playerId: player.id,
          date,
        },
      },
      create: {
        player: { connect: { id: player.id } },
        date,
        readinessScore: data.readinessScore,
        hasNewInjury: data.hasNewInjury,
        injuryPart: data.injuryPart,
        injuryScore: data.injuryScore,
        probeFeedback: data.probeFeedback,
        sleepQuality: data.sleepQuality,
        stressScore: data.stressScore,
        fatigueScore: data.fatigueScore,
        sorenessScore: data.sorenessScore,
        cycleDay: data.cycleDay,
        cyclePhaseCode: data.cyclePhaseCode,
        cycleConfidence: data.cycleConfidence,
        physiologicalLoadTag: data.physiologicalLoadTag,
        crampsScore: data.crampsScore,
        cycleEnergy: data.cycleEnergy,
        cycleMood: data.cycleMood,
        cycleIrregularFlag: data.cycleIrregularFlag,
      },
      update: {
        readinessScore: data.readinessScore,
        hasNewInjury: data.hasNewInjury,
        injuryPart: data.injuryPart,
        injuryScore: data.injuryScore,
        probeFeedback: data.probeFeedback,
        sleepQuality: data.sleepQuality,
        stressScore: data.stressScore,
        fatigueScore: data.fatigueScore,
        sorenessScore: data.sorenessScore,
        cycleDay: data.cycleDay,
        cyclePhaseCode: data.cyclePhaseCode,
        cycleConfidence: data.cycleConfidence,
        physiologicalLoadTag: data.physiologicalLoadTag,
        crampsScore: data.crampsScore,
        cycleEnergy: data.cycleEnergy,
        cycleMood: data.cycleMood,
        cycleIrregularFlag: data.cycleIrregularFlag,
      },
    });

    return { success: true };
  } catch (error) {
    console.error("数据库写入失败的完整原因:", error);
    return { success: false, error: errorMessage(error) };
  }
}

// 推导步骤：按 playerId 倒序拉 ReadinessCheck → 映射为前端 ReadinessHistoryEntry
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
      readinessScore: row.readinessScore,
      hasNewInjury: row.hasNewInjury,
      injuryPart: row.injuryPart,
      injuryScore: row.injuryScore,
      probeFeedback: row.probeFeedback,
      sleepQuality: row.sleepQuality,
      stressScore: row.stressScore,
      fatigueScore: row.fatigueScore,
      sorenessScore: row.sorenessScore,
    }));

    return { success: true, history };
  } catch (error) {
    console.error("数据库写入失败的完整原因:", error);
    return { success: false, error: errorMessage(error) };
  }
}

// 推导步骤：校验 playerId/部位/VAS/症状 → create InjuryLog → 返回前端契约条目
export async function saveInjuryLog(
  payload: SaveInjuryLogPayload
): Promise<ActionResult<{ entry: InjuryLogEntry }>> {
  try {
    if (typeof payload.playerId !== "string" || !payload.playerId.trim()) {
      return { success: false, error: "playerId 无效" };
    }
    const painArea = asPainArea(payload.painArea);
    if (!painArea) {
      return { success: false, error: "painArea 无效" };
    }
    if (
      typeof payload.painScore !== "number" ||
      !Number.isFinite(payload.painScore)
    ) {
      return { success: false, error: "painScore 无效" };
    }
    if (typeof payload.symptom !== "string" || !payload.symptom.trim()) {
      return { success: false, error: "symptom 无效" };
    }

    const player = await prisma.player.findUnique({
      where: { id: payload.playerId },
      select: { id: true, name: true },
    });
    if (!player) {
      return { success: false, error: "云端无此队员" };
    }

    const painScore = Math.max(0, Math.min(10, Math.round(payload.painScore)));
    const symptom = payload.symptom.trim();

    console.log(
      "即将送入 Prisma 的数据:",
      JSON.stringify(
        { playerId: player.id, painArea, painScore, symptom },
        null,
        2
      )
    );

    const row = await prisma.injuryLog.create({
      data: {
        player: { connect: { id: player.id } },
        schemaVersion: INJURY_LOG_SCHEMA_VERSION,
        painArea,
        painScore,
        symptom,
      },
    });

    const entry: InjuryLogEntry = {
      schemaVersion: row.schemaVersion,
      id: row.id,
      playerId: row.playerId,
      playerName: player.name,
      painArea: row.painArea,
      painAreaLabel: PAIN_AREA_LABEL[row.painArea],
      painScore: row.painScore,
      symptom: row.symptom,
      timestamp: row.createdAt.getTime(),
    };

    return { success: true, entry };
  } catch (error) {
    console.error("数据库写入失败的完整原因:", error);
    return { success: false, error: errorMessage(error) };
  }
}

// 推导步骤：按 playerId 倒序拉 InjuryLog → 映射为 InjuryLogEntry
export async function getInjuryLogs(
  playerId: string
): Promise<ActionResult<{ logs: InjuryLogEntry[] }>> {
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

    const rows = await prisma.injuryLog.findMany({
      where: { playerId: player.id },
      orderBy: { createdAt: "desc" },
    });

    const logs: InjuryLogEntry[] = rows.map((row) => ({
      schemaVersion: row.schemaVersion,
      id: row.id,
      playerId: row.playerId,
      playerName: player.name,
      painArea: row.painArea,
      painAreaLabel: PAIN_AREA_LABEL[row.painArea],
      painScore: row.painScore,
      symptom: row.symptom,
      timestamp: row.createdAt.getTime(),
    }));

    return { success: true, logs };
  } catch (error) {
    console.error("数据库写入失败的完整原因:", error);
    return { success: false, error: errorMessage(error) };
  }
}

export type CoachFlagRow = {
  playerId: string;
  playerName: string;
  tier: Exclude<ReadinessTier, "green">;
  readinessScore: number;
  reason: string;
  injuryPartLabel: string | null;
  /** 脱敏生理负荷；无授权或无标签时为 null */
  physiologicalLoadLabel: string | null;
  physiologicalLoadHint: string | null;
};

export type CoachSessionFeedbackRow = {
  playerId: string;
  playerName: string;
  sessionRpe: number;
  durationMin: number;
  /** RPE × 时长；仅展示，不做 ACWR */
  loadAu: number;
  hasPain: boolean;
  painAreaLabel: string | null;
  note: string | null;
};

export type CoachDaySummary = {
  date: string;
  red: CoachFlagRow[];
  yellow: CoachFlagRow[];
  /** 已授权且当日有脱敏负荷标签的绿档球员 */
  loadNotes: CoachFlagRow[];
  sessionFeedbacks: CoachSessionFeedbackRow[];
  checkedInCount: number;
  rosterCount: number;
  uncheckedCount: number;
  feedbackCount: number;
};

export type SaveSessionFeedbackPayload = {
  playerId: string;
  date: string;
  sessionRpe: number;
  durationMin: number;
  hasPain: boolean;
  painArea: PainArea | null;
  note: string | null;
};

// 推导步骤：校验 RPE/时长 → upsert SessionFeedback（每日一条）
export async function saveSessionFeedback(
  payload: SaveSessionFeedbackPayload
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

    const hasPain = Boolean(payload.hasPain);
    const painArea = hasPain ? asPainArea(payload.painArea) : null;
    if (hasPain && !painArea) {
      return { success: false, error: "有不适时须选择部位" };
    }

    const noteRaw =
      typeof payload.note === "string" ? payload.note.trim() : "";
    const note = noteRaw ? noteRaw.slice(0, 200) : null;

    const player = await prisma.player.findUnique({
      where: { id: payload.playerId },
      select: { id: true },
    });
    if (!player) {
      return { success: false, error: "云端无此队员" };
    }

    const date = parseDateOnly(payload.date);
    const durationMin = Math.round(payload.durationMin);
    const data = {
      schemaVersion: SESSION_FEEDBACK_SCHEMA_VERSION,
      sessionRpe,
      durationMin,
      hasPain,
      painArea,
      note,
    };

    console.log(
      "即将送入 Prisma 的数据:",
      JSON.stringify({ playerId: player.id, date: payload.date, ...data }, null, 2)
    );

    await prisma.sessionFeedback.upsert({
      where: {
        playerId_date: {
          playerId: player.id,
          date,
        },
      },
      create: {
        player: { connect: { id: player.id } },
        date,
        schemaVersion: data.schemaVersion,
        sessionRpe: data.sessionRpe,
        durationMin: data.durationMin,
        hasPain: data.hasPain,
        painArea: data.painArea,
        note: data.note,
      },
      update: {
        schemaVersion: data.schemaVersion,
        sessionRpe: data.sessionRpe,
        durationMin: data.durationMin,
        hasPain: data.hasPain,
        painArea: data.painArea,
        note: data.note,
      },
    });

    return { success: true };
  } catch (error) {
    console.error("数据库写入失败的完整原因:", error);
    return { success: false, error: errorMessage(error) };
  }
}

// 推导步骤：校验请求者是教练 → 拉同队当日 readiness + 训后反馈 → 红/黄 + 训后栏
export async function getCoachDaySummary(
  requesterPlayerId: string,
  dateStr?: string
): Promise<ActionResult<{ summary: CoachDaySummary }>> {
  try {
    if (
      typeof requesterPlayerId !== "string" ||
      !requesterPlayerId.trim()
    ) {
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
    if (!requester) {
      return { success: false, error: "云端无此队员" };
    }
    if (requester.role !== "coach") {
      return { success: false, error: "仅教练可查看全队日摘要" };
    }

    const roster = await prisma.player.findMany({
      where: { teamId: requester.teamId },
      orderBy: { name: "asc" },
      select: { id: true, name: true, role: true },
    });
    const rosterIds = roster.map((p) => p.id);
    const playerIds = roster
      .filter((p) => p.role !== "coach")
      .map((p) => p.id);
    const nameById = new Map(roster.map((p) => [p.id, p.name]));
    const day = parseDateOnly(date);

    const [checks, feedbackRows, profiles] = await Promise.all([
      prisma.readinessCheck.findMany({
        where: { playerId: { in: rosterIds }, date: day },
      }),
      prisma.sessionFeedback.findMany({
        where: { playerId: { in: playerIds }, date: day },
        orderBy: [{ hasPain: "desc" }, { sessionRpe: "desc" }],
      }),
      prisma.cycleProfile.findMany({
        where: { playerId: { in: rosterIds } },
        select: {
          playerId: true,
          sharingLevel: true,
          trackingEnabled: true,
        },
      }),
    ]);

    const profileByPlayer = new Map(
      profiles.map((p) => [p.playerId, p] as const)
    );
    const checkByPlayer = new Map(checks.map((row) => [row.playerId, row]));
    const red: CoachFlagRow[] = [];
    const yellow: CoachFlagRow[] = [];
    const loadNotes: CoachFlagRow[] = [];

    for (const player of roster) {
      const row = checkByPlayer.get(player.id);
      if (!row) continue;

      const derived = deriveReadinessTier({
        readinessScore: row.readinessScore,
        hasNewInjury: row.hasNewInjury,
        injuryPart: row.injuryPart,
        injuryScore: row.injuryScore,
        probeFeedback: row.probeFeedback,
      });

      const profile = profileByPlayer.get(player.id);
      const canShareLoad =
        profile?.trackingEnabled === true &&
        (profile.sharingLevel === "load_only" ||
          profile.sharingLevel === "phase_label");
      const tag = canShareLoad ? row.physiologicalLoadTag : null;
      const physiologicalLoadLabel = tag ? LOAD_TAG_LABEL[tag] : null;
      const physiologicalLoadHint = tag ? LOAD_TAG_COACH_HINT[tag] : null;

      if (derived.tier === "red" || derived.tier === "yellow") {
        const flag: CoachFlagRow = {
          playerId: player.id,
          playerName: player.name,
          tier: derived.tier,
          readinessScore: row.readinessScore,
          reason: derived.reason,
          injuryPartLabel: derived.injuryPartLabel,
          physiologicalLoadLabel,
          physiologicalLoadHint,
        };
        if (derived.tier === "red") red.push(flag);
        else yellow.push(flag);
      } else if (physiologicalLoadLabel && physiologicalLoadHint) {
        loadNotes.push({
          playerId: player.id,
          playerName: player.name,
          tier: "yellow",
          readinessScore: row.readinessScore,
          reason: physiologicalLoadLabel,
          injuryPartLabel: null,
          physiologicalLoadLabel,
          physiologicalLoadHint,
        });
      }
    }

    const sessionFeedbacks: CoachSessionFeedbackRow[] = feedbackRows.map(
      (row) => ({
        playerId: row.playerId,
        playerName: nameById.get(row.playerId) ?? "未知",
        sessionRpe: row.sessionRpe,
        durationMin: row.durationMin,
        loadAu: row.sessionRpe * row.durationMin,
        hasPain: row.hasPain,
        painAreaLabel: row.painArea ? PAIN_AREA_LABEL[row.painArea] : null,
        note: row.note,
      })
    );

    const checkedInCount = checks.length;
    const rosterCount = roster.length;

    return {
      success: true,
      summary: {
        date,
        red,
        yellow,
        loadNotes,
        sessionFeedbacks,
        checkedInCount,
        rosterCount,
        uncheckedCount: Math.max(0, rosterCount - checkedInCount),
        feedbackCount: sessionFeedbacks.length,
      },
    };
  } catch (error) {
    console.error("数据库写入失败的完整原因:", error);
    return { success: false, error: errorMessage(error) };
  }
}

// ——— 生理周期：知情同意 / 事件 / 个人化长度 ———

async function loadPeriodStartDates(playerId: string): Promise<string[]> {
  const rows = await prisma.cycleEvent.findMany({
    where: { playerId, eventType: "period_start" },
    orderBy: { date: "asc" },
    select: { date: true },
  });
  return rows.map((r) => formatDateOnly(r.date));
}

async function toCycleProfileDto(
  playerId: string
): Promise<CycleProfileDto | null> {
  const profile = await prisma.cycleProfile.findUnique({
    where: { playerId },
  });
  if (!profile) return null;

  const periodStartDates = await loadPeriodStartDates(playerId);
  const resolved = resolveCycleLength(periodStartDates);

  return {
    trackingEnabled: profile.trackingEnabled,
    sharingLevel: profile.sharingLevel,
    typicalLengthDays: profile.typicalLengthDays,
    hormonalContraception: profile.hormonalContraception,
    bodyImageAnxietyOptIn: profile.bodyImageAnxietyOptIn,
    consentAt: profile.consentAt ? profile.consentAt.toISOString() : null,
    periodStartDates,
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

// 推导步骤：查 CycleProfile + period_start 事件 → 组装 DTO（无档案返回 null）
export async function getCycleProfile(
  playerId: string
): Promise<ActionResult<{ profile: CycleProfileDto | null }>> {
  try {
    if (typeof playerId !== "string" || !playerId.trim()) {
      return { success: false, error: "playerId 无效" };
    }
    const profile = await toCycleProfileDto(playerId);
    return { success: true, profile };
  } catch (error) {
    console.error("数据库写入失败的完整原因:", error);
    return { success: false, error: errorMessage(error) };
  }
}

export type ConsentCyclePayload = {
  playerId: string;
  sharingLevel?: CycleSharingLevel;
  seedPeriodStart?: string;
};

// 推导步骤：校验队员 → upsert 同意档案 → 可选写入首条经期开始 → 刷新典型长度
export async function consentToCycleTracking(
  payload: ConsentCyclePayload
): Promise<ActionResult<{ profile: CycleProfileDto }>> {
  try {
    if (typeof payload.playerId !== "string" || !payload.playerId.trim()) {
      return { success: false, error: "playerId 无效" };
    }
    const sharingLevel =
      asCycleSharingLevel(payload.sharingLevel) ?? "none";

    const player = await prisma.player.findUnique({
      where: { id: payload.playerId },
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
  playerId: string;
  sharingLevel?: CycleSharingLevel;
  hormonalContraception?: boolean;
  bodyImageAnxietyOptIn?: boolean;
  trackingEnabled?: boolean;
};

// 推导步骤：须已有同意档案 → 更新分享级别/激素避孕/敏感项/开关
export async function updateCycleProfileSettings(
  payload: UpdateCycleProfilePayload
): Promise<ActionResult<{ profile: CycleProfileDto }>> {
  try {
    if (typeof payload.playerId !== "string" || !payload.playerId.trim()) {
      return { success: false, error: "playerId 无效" };
    }

    const existing = await prisma.cycleProfile.findUnique({
      where: { playerId: payload.playerId },
    });
    if (!existing || !existing.consentAt) {
      return { success: false, error: "请先完成知情同意" };
    }

    const sharingLevel = asCycleSharingLevel(payload.sharingLevel);
    await prisma.cycleProfile.update({
      where: { playerId: payload.playerId },
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

    const profile = await toCycleProfileDto(payload.playerId);
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
  playerId: string;
  date: string;
  crampsScore?: number;
};

// 推导步骤：须追踪开启 → 同日 period_start 去重 → 刷新 typicalLengthDays
export async function recordPeriodStart(
  payload: RecordPeriodStartPayload
): Promise<ActionResult<{ profile: CycleProfileDto }>> {
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

    const profileRow = await prisma.cycleProfile.findUnique({
      where: { playerId: payload.playerId },
    });
    if (!profileRow?.consentAt || !profileRow.trackingEnabled) {
      return { success: false, error: "周期追踪未开启" };
    }

    const date = parseDateOnly(payload.date);
    const crampsScore = clampScore0to10(payload.crampsScore);
    const existing = await prisma.cycleEvent.findFirst({
      where: {
        playerId: payload.playerId,
        eventType: "period_start",
        date,
      },
    });
    if (!existing) {
      await prisma.cycleEvent.create({
        data: {
          player: { connect: { id: payload.playerId } },
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

    await refreshTypicalLength(payload.playerId);
    const profile = await toCycleProfileDto(payload.playerId);
    if (!profile) {
      return { success: false, error: "周期档案读取失败" };
    }
    return { success: true, profile };
  } catch (error) {
    console.error("数据库写入失败的完整原因:", error);
    return { success: false, error: errorMessage(error) };
  }
}

