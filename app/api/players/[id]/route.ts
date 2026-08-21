import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { type Gender, normalizePlayerRole } from "@/lib/players";
import { requireApiSession } from "@/lib/auth/apiGuard";
import { canManageAccounts } from "@/lib/auth/policy";

type RouteContext = { params: Promise<{ id: string }> };

function serializePlayer(player: {
  id: string;
  name: string;
  gender: Gender | null;
  role: "player" | "coach";
}) {
  return {
    id: player.id,
    name: player.name,
    gender: player.gender ?? undefined,
    role: normalizePlayerRole(player.role),
  };
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const gate = await requireApiSession();
    if (!gate.ok) return gate.response;

    const { id } = await context.params;
    const existing = await prisma.player.findFirst({
      where: { id, teamId: gate.ctx.teamId },
    });
    if (!existing) {
      return NextResponse.json({ error: "队员不存在" }, { status: 404 });
    }

    const isOwn = gate.ctx.playerId === id;
    const isAdmin = canManageAccounts(gate.ctx);
    if (!isOwn && !isAdmin) {
      return NextResponse.json({ error: "无权修改该队员" }, { status: 403 });
    }

    const body: unknown = await request.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "无效请求体" }, { status: 400 });
    }
    const obj = body as Record<string, unknown>;

    if (obj.role === "player" || obj.role === "coach") {
      return NextResponse.json(
        { error: "角色请在账号管理中授予，不可经此接口改写" },
        { status: 403 }
      );
    }

    const data: {
      name?: string;
      gender?: Gender;
    } = {};

    if (typeof obj.name === "string") {
      const name = obj.name.trim();
      if (!name) {
        return NextResponse.json({ error: "姓名不能为空" }, { status: 400 });
      }
      data.name = name;
    }
    if (obj.gender === "male" || obj.gender === "female") {
      data.gender = obj.gender;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "无有效字段" }, { status: 400 });
    }

    const player = await prisma.player.update({
      where: { id },
      data,
    });
    return NextResponse.json(serializePlayer(player));
  } catch (error) {
    console.error("[PATCH /api/players/:id]", error);
    return NextResponse.json({ error: "更新队员失败" }, { status: 500 });
  }
}
