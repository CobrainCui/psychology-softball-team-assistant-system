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

const DEFAULT_TEAM_NAME = "心理学部队";

/** Server Action 统一结果：禁止靠 throw 驱动前端分支（易静默失败） */
export type ActionOk<T> = { success: true } & T;
export type ActionErr = { success: false; error: string };
export type ActionResult<T> = ActionOk<T> | ActionErr;

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
      const cloud = toCloudPlayer(existing);
      return {
        success: true,
        player: {
          id: cloud.id,
          name: cloud.name,
          gender: cloud.gender ?? gender,
          role: cloud.role,
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
