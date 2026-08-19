"use server";

import { prisma } from "@/lib/db";
import {
  normalizePlayerRole,
  type Gender,
  type Player,
  type PlayerRole,
} from "@/lib/players";
import {
  collectSessionArchivePlayerIds,
  normalizeSessionArchivePayload,
  sessionArchiveHasContent,
  type SessionArchivePayload,
} from "@/lib/testDay/archiveValidation";
import { buildTestSessionCreateInput } from "@/lib/testDay/sessionArchiveWrite";
import { resolveCycleLength } from "@/lib/clinical/cycleStats";
import type {
  CycleProfileDto,
  CycleSharingLevel,
  PeriodStartEventDto,
} from "@/lib/cycleTypes";
import { parseDateOnly, formatDateOnly } from "@/lib/dateOnly";
import {
  getCoachDaySummary,
  getInjuryCases,
  getPlayerProfileData,
  getReadinessHistory,
  saveReadinessAssessment,
  deleteReadinessAssessment,
  saveSessionFeedback,
  getSessionFeedbacks,
  updateSessionFeedback,
  deleteSessionFeedback,
  createInjuryCase,
  addInjuryPainLog,
  addInjuryNote,
  markInjuryRecovered,
  updateInjuryCase,
  deleteInjuryCase,
  updateInjuryPainLog,
  deleteInjuryPainLog,
  updateInjuryNote,
  deleteInjuryNote,
} from "@/lib/statusActions";

export {
  getCoachDaySummary,
  getInjuryCases,
  getPlayerProfileData,
  getReadinessHistory,
  saveReadinessAssessment,
  deleteReadinessAssessment,
  saveSessionFeedback,
  getSessionFeedbacks,
  updateSessionFeedback,
  deleteSessionFeedback,
  createInjuryCase,
  addInjuryPainLog,
  addInjuryNote,
  markInjuryRecovered,
  updateInjuryCase,
  deleteInjuryCase,
  updateInjuryPainLog,
  deleteInjuryPainLog,
  updateInjuryNote,
  deleteInjuryNote,
};
export type {
  CoachDaySummary,
  CoachPlotPoint,
  CoachSessionFeedbackRow,
  InjuryCaseDto,
  InjuryNoteDto,
  InjuryPainLogDto,
  ProfileLatestStatus,
  SaveReadinessPayload,
  SaveSessionFeedbackPayload,
  SessionFeedbackSaved,
} from "@/lib/statusActions";

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

export type SaveTestSessionPayload = SessionArchivePayload;

export type SaveTestSessionResult =
  | { success: true; id: string; gameId: number; date: string }
  | { success: false; error: string };

// 推导步骤：校验非空 → 校验 playerId → buildTestSessionCreateInput → create
export async function saveTestSession(
  payload: SaveTestSessionPayload
): Promise<SaveTestSessionResult> {
  try {
    const data = normalizeSessionArchivePayload(payload);

    if (!sessionArchiveHasContent(data)) {
      return { success: false, error: "归档内容为空" };
    }

    const team = await getOrCreateDefaultTeam();
    const archivedAt = new Date();
    const prismaData = buildTestSessionCreateInput(payload, team.id, archivedAt);

    const playerIds = collectSessionArchivePlayerIds(data);
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
    return { success: false, error: errorMessage(error) };
  }
}

function clampScore0to10(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(10, Math.round(value)));
}

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

// ——— 生理周期：知情同意 / 事件 / 个人化长度 ———

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

export async function consentToCycleTracking(
  payload: ConsentCyclePayload
): Promise<ActionResult<{ profile: CycleProfileDto }>> {
  try {
    if (typeof payload.playerId !== "string" || !payload.playerId.trim()) {
      return { success: false, error: "playerId 无效" };
    }
    const sharingLevel = asCycleSharingLevel(payload.sharingLevel) ?? "none";

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

export type UpdatePeriodStartEventPayload = {
  playerId: string;
  eventId: string;
  date?: string;
  crampsScore?: number | null;
};

export async function updatePeriodStartEvent(
  payload: UpdatePeriodStartEventPayload
): Promise<ActionResult<{ profile: CycleProfileDto }>> {
  try {
    if (typeof payload.playerId !== "string" || !payload.playerId.trim()) {
      return { success: false, error: "playerId 无效" };
    }
    const existing = await prisma.cycleEvent.findFirst({
      where: {
        id: payload.eventId,
        playerId: payload.playerId,
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
          playerId: payload.playerId,
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
    await refreshTypicalLength(payload.playerId);
    const profile = await toCycleProfileDto(payload.playerId);
    if (!profile) return { success: false, error: "周期档案读取失败" };
    return { success: true, profile };
  } catch (error) {
    console.error("数据库写入失败的完整原因:", error);
    return { success: false, error: errorMessage(error) };
  }
}

export async function deletePeriodStartEvent(payload: {
  playerId: string;
  eventId: string;
}): Promise<ActionResult<{ profile: CycleProfileDto }>> {
  try {
    if (typeof payload.playerId !== "string" || !payload.playerId.trim()) {
      return { success: false, error: "playerId 无效" };
    }
    const existing = await prisma.cycleEvent.findFirst({
      where: {
        id: payload.eventId,
        playerId: payload.playerId,
        eventType: "period_start",
      },
    });
    if (!existing) return { success: false, error: "找不到该经期开始记录" };
    await prisma.cycleEvent.delete({ where: { id: existing.id } });
    await refreshTypicalLength(payload.playerId);
    const profile = await toCycleProfileDto(payload.playerId);
    if (!profile) return { success: false, error: "周期档案读取失败" };
    return { success: true, profile };
  } catch (error) {
    console.error("数据库写入失败的完整原因:", error);
    return { success: false, error: errorMessage(error) };
  }
}
