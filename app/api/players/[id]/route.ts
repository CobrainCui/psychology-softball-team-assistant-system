import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { normalizePlayerRole, type Gender } from "@/lib/players";

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
    const { id } = await context.params;
    const body: unknown = await request.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "无效请求体" }, { status: 400 });
    }
    const obj = body as Record<string, unknown>;

    const data: {
      name?: string;
      gender?: Gender;
      role?: "player" | "coach";
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
    if (obj.role === "player" || obj.role === "coach") {
      data.role = obj.role;
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
