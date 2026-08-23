import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  sessionArchiveInclude,
  sessionToGameArchive,
} from "@/lib/sessionMapper";
import { CLOUD_DRAFT_ARCHIVE_ONLY_ERROR } from "@/lib/testDay/archiveValidation";
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
    return NextResponse.json(
      sessions.map((row) => sessionToGameArchive(row, gate.ctx.teamTimeZone))
    );
  } catch (error) {
    console.error("[GET /api/sessions]", error);
    return NextResponse.json({ error: "读取归档失败" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  void request;
  try {
    const gate = await requireApiArchiver();
    if (!gate.ok) return gate.response;
    return NextResponse.json(
      { error: CLOUD_DRAFT_ARCHIVE_ONLY_ERROR },
      { status: 410 }
    );
  } catch (error) {
    console.error("[POST /api/sessions]", error);
    return NextResponse.json({ error: "归档失败" }, { status: 500 });
  }
}
