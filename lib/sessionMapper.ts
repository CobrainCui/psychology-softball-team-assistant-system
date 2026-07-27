// TestSession（DB）↔ GameArchive（前端）映射；读取端统一走 migrate 契约。

import {
  GAME_ARCHIVE_SCHEMA_VERSION,
  type GameArchive,
  type HitQuality,
  type HitRecord,
  type HitResult,
  type PitchType,
  type SpeedRecord,
} from "@/lib/gameArchive";

type SessionWithRelations = {
  schemaVersion: number;
  archivedAt: Date;
  hits: {
    id: string;
    playerId: string;
    result: HitResult;
    x: number | null;
    y: number | null;
    pitchType: PitchType | null;
    hitQuality: HitQuality | null;
    recordedAt: Date;
    player: { id: string; name: string };
  }[];
  speedRecords: {
    id: string;
    playerId: string;
    firstBaseSeconds: number | null;
    secondBaseSeconds: number | null;
    customSeconds: number | null;
    recordedAt: Date;
    player: { id: string; name: string };
  }[];
};

const HIT_RESULTS: ReadonlySet<string> = new Set([
  "LD",
  "FB",
  "GB",
  "PU",
  "MISS",
]);
const PITCH_TYPES: ReadonlySet<string> = new Set([
  "FB",
  "CB",
  "SL",
  "CH",
  "OT",
]);
const HIT_QUALITIES: ReadonlySet<string> = new Set([
  "Hard",
  "Medium",
  "Soft",
]);

export function asHitResult(value: unknown): HitResult | null {
  return typeof value === "string" && HIT_RESULTS.has(value)
    ? (value as HitResult)
    : null;
}

export function asPitchType(value: unknown): PitchType | null {
  return typeof value === "string" && PITCH_TYPES.has(value)
    ? (value as PitchType)
    : null;
}

export function asHitQuality(value: unknown): HitQuality | null {
  return typeof value === "string" && HIT_QUALITIES.has(value)
    ? (value as HitQuality)
    : null;
}

// 推导步骤：archivedAt → date/gameId；关联 player.name 填回前端 HitRecord
export function sessionToGameArchive(session: SessionWithRelations): GameArchive {
  const hits: HitRecord[] = session.hits.map((hit) => ({
    id: hit.id,
    x: hit.x ?? undefined,
    y: hit.y ?? undefined,
    result: hit.result,
    playerId: hit.playerId,
    playerName: hit.player.name,
    pitchType: hit.pitchType ?? undefined,
    hitQuality: hit.hitQuality ?? undefined,
    timestamp: hit.recordedAt.getTime(),
  }));

  const speedRecords: SpeedRecord[] = session.speedRecords.map((row) => ({
    id: row.id,
    playerId: row.playerId,
    playerName: row.player.name,
    firstBaseSeconds: row.firstBaseSeconds,
    secondBaseSeconds: row.secondBaseSeconds,
    customSeconds: row.customSeconds,
    timestamp: row.recordedAt.getTime(),
  }));

  return {
    schemaVersion: session.schemaVersion || GAME_ARCHIVE_SCHEMA_VERSION,
    gameId: session.archivedAt.getTime(),
    date: session.archivedAt.toISOString(),
    hits,
    speedRecords,
  };
}
