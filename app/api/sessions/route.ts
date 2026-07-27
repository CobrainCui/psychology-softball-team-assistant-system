import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ensureDefaultTeam } from "@/lib/ensureTeam";
import { GAME_ARCHIVE_SCHEMA_VERSION } from "@/lib/gameArchive";
import {
  asHitQuality,
  asHitResult,
  asPitchType,
  sessionToGameArchive,
} from "@/lib/sessionMapper";

export async function GET() {
  try {
    const team = await ensureDefaultTeam();
    const sessions = await prisma.testSession.findMany({
      where: { teamId: team.id },
      orderBy: { archivedAt: "asc" },
      include: {
        hits: { include: { player: { select: { id: true, name: true } } } },
        speedRecords: {
          include: { player: { select: { id: true, name: true } } },
        },
      },
    });
    return NextResponse.json(sessions.map(sessionToGameArchive));
  } catch (error) {
    console.error("[GET /api/sessions]", error);
    return NextResponse.json({ error: "读取归档失败" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "无效请求体" }, { status: 400 });
    }
    const obj = body as Record<string, unknown>;
    const hitsRaw = Array.isArray(obj.hits) ? obj.hits : [];
    const speedRaw = Array.isArray(obj.speedRecords) ? obj.speedRecords : [];

    if (hitsRaw.length === 0 && speedRaw.length === 0) {
      return NextResponse.json(
        { error: "归档内容为空" },
        { status: 400 }
      );
    }

    // 推导步骤：校验枚举与 playerId → 事务写入 TestSession + Hit + SpeedRecord
    const hitRows: {
      playerId: string;
      result: NonNullable<ReturnType<typeof asHitResult>>;
      x: number | null;
      y: number | null;
      pitchType: ReturnType<typeof asPitchType>;
      hitQuality: ReturnType<typeof asHitQuality>;
      recordedAt: Date;
    }[] = [];

    for (const item of hitsRaw) {
      if (!item || typeof item !== "object") {
        return NextResponse.json({ error: "打点记录无效" }, { status: 400 });
      }
      const hit = item as Record<string, unknown>;
      const result = asHitResult(hit.result);
      if (typeof hit.playerId !== "string" || !result) {
        return NextResponse.json({ error: "打点缺 playerId/result" }, { status: 400 });
      }
      const ts =
        typeof hit.timestamp === "number" && Number.isFinite(hit.timestamp)
          ? hit.timestamp
          : Date.now();
      hitRows.push({
        playerId: hit.playerId,
        result,
        x: typeof hit.x === "number" ? hit.x : null,
        y: typeof hit.y === "number" ? hit.y : null,
        pitchType: asPitchType(hit.pitchType),
        hitQuality: asHitQuality(hit.hitQuality),
        recordedAt: new Date(ts),
      });
    }

    const speedRows: {
      playerId: string;
      firstBaseSeconds: number | null;
      secondBaseSeconds: number | null;
      customSeconds: number | null;
      recordedAt: Date;
    }[] = [];

    for (const item of speedRaw) {
      if (!item || typeof item !== "object") {
        return NextResponse.json({ error: "速度记录无效" }, { status: 400 });
      }
      const row = item as Record<string, unknown>;
      if (typeof row.playerId !== "string") {
        return NextResponse.json({ error: "速度缺 playerId" }, { status: 400 });
      }
      const ts =
        typeof row.timestamp === "number" && Number.isFinite(row.timestamp)
          ? row.timestamp
          : Date.now();
      speedRows.push({
        playerId: row.playerId,
        firstBaseSeconds:
          typeof row.firstBaseSeconds === "number" ? row.firstBaseSeconds : null,
        secondBaseSeconds:
          typeof row.secondBaseSeconds === "number"
            ? row.secondBaseSeconds
            : null,
        customSeconds:
          typeof row.customSeconds === "number" ? row.customSeconds : null,
        recordedAt: new Date(ts),
      });
    }

    const team = await ensureDefaultTeam();
    const playerIds = [
      ...new Set([
        ...hitRows.map((h) => h.playerId),
        ...speedRows.map((s) => s.playerId),
      ]),
    ];
    const existing = await prisma.player.findMany({
      where: { teamId: team.id, id: { in: playerIds } },
      select: { id: true },
    });
    if (existing.length !== playerIds.length) {
      return NextResponse.json(
        { error: "含未入册队员 id，请先从云端名册录入后再归档" },
        { status: 400 }
      );
    }

    const archivedAt = new Date();
    const session = await prisma.testSession.create({
      data: {
        teamId: team.id,
        schemaVersion: GAME_ARCHIVE_SCHEMA_VERSION,
        archivedAt,
        hits: {
          create: hitRows.map((hit) => ({
            playerId: hit.playerId,
            result: hit.result,
            x: hit.x,
            y: hit.y,
            pitchType: hit.pitchType,
            hitQuality: hit.hitQuality,
            recordedAt: hit.recordedAt,
          })),
        },
        speedRecords: {
          create: speedRows.map((row) => ({
            playerId: row.playerId,
            firstBaseSeconds: row.firstBaseSeconds,
            secondBaseSeconds: row.secondBaseSeconds,
            customSeconds: row.customSeconds,
            recordedAt: row.recordedAt,
          })),
        },
      },
      include: {
        hits: { include: { player: { select: { id: true, name: true } } } },
        speedRecords: {
          include: { player: { select: { id: true, name: true } } },
        },
      },
    });

    return NextResponse.json(sessionToGameArchive(session), { status: 201 });
  } catch (error) {
    console.error("[POST /api/sessions]", error);
    return NextResponse.json({ error: "归档失败" }, { status: 500 });
  }
}
