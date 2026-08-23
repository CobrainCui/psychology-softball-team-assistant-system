// TestSession（DB）↔ GameArchive（前端）映射；读取端统一走 migrate 契约。

import {
  GAME_ARCHIVE_SCHEMA_VERSION,
  HIT_QUALITY_VALUES,
  HIT_RESULT_VALUES,
  PITCH_TYPE_VALUES,
  type FlyCatchAttempt,
  type GameArchive,
  type HitQuality,
  type HitRecord,
  type HitResult,
  type PitchCall,
  type PitchType,
  type SpeedColumn,
  type SpeedMark,
  type SpeedRecord,
  type StrikeJudgeCell,
  type StrikeJudgeColumn,
  type ThrowBlame,
  type ThrowPlay,
  type ThrowTestItem,
} from "@/lib/gameArchive";
import { resolveSpeedGrid } from "@/lib/testDay/speedGrid";
import { parseCustomTestSlice } from "@/lib/testDay/customTests";
import {
  DEFAULT_TEST_ITEMS,
  ensureRoleAssignmentItems,
  parseAssignmentLog,
  parseAssignments,
} from "@/lib/sessionDraft";

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
  speedColumns?: {
    id: string;
    name: string;
    sortOrder: number;
  }[];
  speedMarks?: {
    id: string;
    columnId: string;
    playerId: string;
    seconds: number;
    recordedAt: Date;
    player: { id: string; name: string };
  }[];
  flyCatchAttempts: {
    id: string;
    playerId: string;
    caught: boolean;
    note: string | null;
    recordedAt: Date;
    player: { id: string; name: string };
  }[];
  strikeJudgeColumns: {
    id: string;
    pitcherId: string;
    sortOrder: number;
    recordedAt: Date;
    pitcher: { id: string; name: string };
  }[];
  strikeJudgeCells: {
    columnId: string;
    judgeId: string;
    pitchCall: PitchCall;
    swung: boolean;
    recordedAt: Date;
    judge: { id: string; name: string };
  }[];
  throwPlays: {
    id: string;
    testItem: string;
    throwerId: string;
    firstBaseId: string;
    success: boolean;
    blame: ThrowBlame | null;
    note: string | null;
    recordedAt: Date;
    thrower: { id: string; name: string };
    firstBase: { id: string; name: string };
  }[];
  customTests?: unknown;
  assignments?: unknown;
  testItems?: unknown;
  assignmentLog?: unknown;
};

const HIT_RESULTS: ReadonlySet<string> = new Set(HIT_RESULT_VALUES);
const PITCH_TYPES: ReadonlySet<string> = new Set(PITCH_TYPE_VALUES);
const HIT_QUALITIES: ReadonlySet<string> = new Set(HIT_QUALITY_VALUES);

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

export const sessionArchiveInclude = {
  hits: { include: { player: { select: { id: true, name: true } } } },
  speedRecords: {
    include: { player: { select: { id: true, name: true } } },
  },
  speedColumns: { orderBy: { sortOrder: "asc" as const } },
  speedMarks: {
    include: { player: { select: { id: true, name: true } } },
  },
  flyCatchAttempts: {
    include: { player: { select: { id: true, name: true } } },
  },
  strikeJudgeColumns: {
    include: { pitcher: { select: { id: true, name: true } } },
    orderBy: { sortOrder: "asc" as const },
  },
  strikeJudgeCells: {
    include: { judge: { select: { id: true, name: true } } },
  },
  throwPlays: {
    include: {
      thrower: { select: { id: true, name: true } },
      firstBase: { select: { id: true, name: true } },
    },
  },
};

// 推导步骤：archivedAt → date/gameId；关联 player.name 填回前端契约
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

  const mappedColumns: SpeedColumn[] = (session.speedColumns ?? []).map(
    (column) => ({
      id: column.id,
      name: column.name,
      sortOrder: column.sortOrder,
    })
  );
  const mappedMarks: SpeedMark[] = (session.speedMarks ?? []).map((mark) => ({
    id: mark.id,
    playerId: mark.playerId,
    playerName: mark.player.name,
    columnId: mark.columnId,
    seconds: mark.seconds,
    timestamp: mark.recordedAt.getTime(),
  }));
  const speedGrid = resolveSpeedGrid(
    mappedColumns,
    mappedMarks,
    speedRecords
  );

  const flyCatchAttempts: FlyCatchAttempt[] = session.flyCatchAttempts.map(
    (row) => ({
      id: row.id,
      playerId: row.playerId,
      playerName: row.player.name,
      caught: row.caught,
      note: row.note ?? undefined,
      timestamp: row.recordedAt.getTime(),
    })
  );

  const strikeJudgeColumns: StrikeJudgeColumn[] =
    session.strikeJudgeColumns.map((column) => ({
      id: column.id,
      pitcherId: column.pitcherId,
      pitcherName: column.pitcher.name,
      sortOrder: column.sortOrder,
    }));

  const strikeJudgeCells: StrikeJudgeCell[] = session.strikeJudgeCells.map(
    (cell) => ({
      columnId: cell.columnId,
      judgeId: cell.judgeId,
      judgeName: cell.judge.name,
      pitchCall: cell.pitchCall,
      swung: cell.swung,
      timestamp: cell.recordedAt.getTime(),
    })
  );

  const throwPlays: ThrowPlay[] = session.throwPlays
    .filter(
      (play): play is typeof play & { testItem: ThrowTestItem } =>
        play.testItem === "6-3传球" || play.testItem === "4-3传球"
    )
    .map((play) => ({
      id: play.id,
      testItem: play.testItem,
      throwerId: play.throwerId,
      throwerName: play.thrower.name,
      firstBaseId: play.firstBaseId,
      firstBaseName: play.firstBase.name,
      success: play.success,
      blame: play.blame ?? undefined,
      note: play.note ?? undefined,
      timestamp: play.recordedAt.getTime(),
    }));

  const custom = parseCustomTestSlice(session.customTests);
  const testItems = ensureRoleAssignmentItems(
    Array.isArray(session.testItems) &&
      session.testItems.every((item) => typeof item === "string") &&
      session.testItems.length > 0
      ? (session.testItems as string[])
      : [...DEFAULT_TEST_ITEMS]
  );

  return {
    schemaVersion: session.schemaVersion || GAME_ARCHIVE_SCHEMA_VERSION,
    gameId: session.archivedAt.getTime(),
    date: session.archivedAt.toISOString(),
    hits,
    speedRecords,
    speedColumns: speedGrid.columns,
    speedMarks: speedGrid.marks,
    flyCatchAttempts,
    strikeJudgeColumns,
    strikeJudgeCells,
    throwPlays,
    ...custom,
    assignments: parseAssignments(session.assignments),
    testItems,
    assignmentLog: parseAssignmentLog(session.assignmentLog),
  };
}
