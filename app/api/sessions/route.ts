import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  sessionArchiveInclude,
  sessionToGameArchive,
} from "@/lib/sessionMapper";
import {
  collectSessionArchivePlayerIds,
  normalizeSessionArchivePayload,
  sessionArchiveHasContent,
  type SessionArchivePayload,
} from "@/lib/testDay/archiveValidation";
import { buildTestSessionCreateInput } from "@/lib/testDay/sessionArchiveWrite";
import {
  requireApiApproved,
  requireApiArchiver,
} from "@/lib/auth/apiGuard";

export async function GET() {
  try {
    const gate = await requireApiApproved();
    if (!gate.ok) return gate.response;

    const sessions = await prisma.testSession.findMany({
      where: { teamId: gate.ctx.teamId },
      orderBy: { archivedAt: "asc" },
      include: sessionArchiveInclude,
    });
    return NextResponse.json(sessions.map(sessionToGameArchive));
  } catch (error) {
    console.error("[GET /api/sessions]", error);
    return NextResponse.json({ error: "读取归档失败" }, { status: 500 });
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

    const payload = body as SessionArchivePayload;
    const data = normalizeSessionArchivePayload(payload);

    if (!sessionArchiveHasContent(data)) {
      return NextResponse.json({ error: "归档内容为空" }, { status: 400 });
    }

    const teamId = gate.ctx.teamId;
    const playerIds = collectSessionArchivePlayerIds(data);
    const existing = await prisma.player.findMany({
      where: { teamId, id: { in: playerIds } },
      select: { id: true },
    });
    if (existing.length !== playerIds.length) {
      return NextResponse.json(
        { error: "含未入册队员 id，请先从云端名册录入后再归档" },
        { status: 400 }
      );
    }

    const archivedAt = new Date();
    const prismaData = buildTestSessionCreateInput(payload, teamId, archivedAt);

    const session = await prisma.testSession.create({
      data: prismaData,
      include: sessionArchiveInclude,
    });

    return NextResponse.json(sessionToGameArchive(session), { status: 201 });
  } catch (error) {
    console.error("[POST /api/sessions]", error);
    return NextResponse.json({ error: "归档失败" }, { status: 500 });
  }
}
