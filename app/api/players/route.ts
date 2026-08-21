import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { normalizePlayerRole, type Gender } from "@/lib/players";
import {
  requireApiApproved,
  requireApiArchiver,
} from "@/lib/auth/apiGuard";

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

export async function GET() {
  try {
    const gate = await requireApiApproved();
    if (!gate.ok) return gate.response;

    const players = await prisma.player.findMany({
      where: { teamId: gate.ctx.teamId },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json(players.map(serializePlayer));
  } catch (error) {
    console.error("[GET /api/players]", error);
    return NextResponse.json({ error: "读取名册失败" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const gate = await requireApiArchiver();
    if (!gate.ok) return gate.response;

    const body: unknown = await request.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "无效请求体" }, { status: 400 });
    }
    const obj = body as Record<string, unknown>;
    const name = typeof obj.name === "string" ? obj.name.trim() : "";
    if (!name) {
      return NextResponse.json({ error: "姓名必填" }, { status: 400 });
    }
    const gender =
      obj.gender === "male" || obj.gender === "female" ? obj.gender : null;

    const player = await prisma.player.create({
      data: {
        teamId: gate.ctx.teamId,
        name,
        gender,
        role: "player",
      },
    });
    return NextResponse.json(serializePlayer(player), { status: 201 });
  } catch (error) {
    console.error("[POST /api/players]", error);
    return NextResponse.json({ error: "创建队员失败" }, { status: 500 });
  }
}
