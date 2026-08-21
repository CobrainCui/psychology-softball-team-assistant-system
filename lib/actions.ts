"use server";

import { prisma } from "@/lib/db";
import {
  normalizePlayerRole,
  type Gender,
  type Player,
  type PlayerRole,
} from "@/lib/players";
import { requireArchiver, requireApprovedSession } from "@/lib/auth/actionGuard";
import {
  collectSessionArchivePlayerIds,
  normalizeSessionArchivePayload,
  sessionArchiveHasContent,
  type SessionArchivePayload,
} from "@/lib/testDay/archiveValidation";
import { buildTestSessionCreateInput } from "@/lib/testDay/sessionArchiveWrite";
import { errorMessage, type ActionResult } from "@/lib/actionResult";

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

// 推导步骤：返回会话所在队全部球员（按创建时间）；须已登录且认领通过
export async function getPlayers(): Promise<
  ActionResult<{ players: CloudPlayer[] }>
> {
  try {
    const gate = await requireApprovedSession();
    if (!gate.success) return gate;

    const rows = await prisma.player.findMany({
      where: { teamId: gate.ctx.teamId },
      orderBy: { createdAt: "asc" },
    });
    return { success: true, players: rows.map(toCloudPlayer) };
  } catch (error) {
    console.error("数据库写入失败的完整原因:", error);
    return { success: false, error: errorMessage(error) };
  }
}

// 推导步骤：队长/教练在测试日现场加名册队员（不创建 Account）
export async function createRosterPlayer(
  name: string,
  gender: Gender
): Promise<ActionResult<{ player: Player }>> {
  try {
    const gate = await requireArchiver();
    if (!gate.success) return gate;

    const trimmed = name.trim();
    if (!trimmed) return { success: false, error: "姓名不能为空" };

    const teamId = gate.ctx.teamId;
    const existing = await prisma.player.findFirst({
      where: { teamId, name: trimmed },
    });
    if (existing) {
      return {
        success: true,
        player: {
          id: existing.id,
          name: existing.name,
          gender: existing.gender ?? gender,
          role: normalizePlayerRole(existing.role),
        },
      };
    }

    const created = await prisma.player.create({
      data: {
        teamId,
        name: trimmed,
        gender,
        role: "player",
      },
    });

    return {
      success: true,
      player: {
        id: created.id,
        name: created.name,
        gender: created.gender ?? gender,
        role: "player",
      },
    };
  } catch (error) {
    console.error("创建队员失败:", error);
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
    const gate = await requireArchiver();
    if (!gate.success) return gate;

    const data = normalizeSessionArchivePayload(payload);

    if (!sessionArchiveHasContent(data)) {
      return { success: false, error: "归档内容为空" };
    }

    const teamId = gate.ctx.teamId;
    const archivedAt = new Date();
    const prismaData = buildTestSessionCreateInput(payload, teamId, archivedAt);

    const playerIds = collectSessionArchivePlayerIds(data);
    if (playerIds.length > 0) {
      const existing = await prisma.player.findMany({
        where: { teamId, id: { in: playerIds } },
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
