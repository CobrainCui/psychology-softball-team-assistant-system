// 测试日归档：空校验与 playerId 收集（actions 与 API 共用）

import type {
  FlyCatchAttempt,
  HitRecord,
  SpeedRecord,
  StrikeJudgeCell,
  StrikeJudgeColumn,
  ThrowPlay,
} from "@/lib/gameArchive";
import type { Assignments } from "@/lib/sessionDraft";

export type SessionArchivePayload = {
  hits: HitRecord[];
  speedRecords: SpeedRecord[];
  flyCatchAttempts?: FlyCatchAttempt[];
  strikeJudgeColumns?: StrikeJudgeColumn[];
  strikeJudgeCells?: StrikeJudgeCell[];
  throwPlays?: ThrowPlay[];
  assignments?: Assignments;
  testItems?: string[];
};

export function normalizeSessionArchivePayload(
  payload: SessionArchivePayload
): Required<
  Pick<
    SessionArchivePayload,
    | "hits"
    | "speedRecords"
    | "flyCatchAttempts"
    | "strikeJudgeColumns"
    | "strikeJudgeCells"
    | "throwPlays"
  >
> {
  return {
    hits: Array.isArray(payload.hits) ? payload.hits : [],
    speedRecords: Array.isArray(payload.speedRecords) ? payload.speedRecords : [],
    flyCatchAttempts: Array.isArray(payload.flyCatchAttempts)
      ? payload.flyCatchAttempts
      : [],
    strikeJudgeColumns: Array.isArray(payload.strikeJudgeColumns)
      ? payload.strikeJudgeColumns
      : [],
    strikeJudgeCells: Array.isArray(payload.strikeJudgeCells)
      ? payload.strikeJudgeCells
      : [],
    throwPlays: Array.isArray(payload.throwPlays) ? payload.throwPlays : [],
  };
}

// 推导步骤：任一类成绩有记录即可归档；空格不算
export function sessionArchiveHasContent(payload: SessionArchivePayload): boolean {
  const data = normalizeSessionArchivePayload(payload);
  return (
    data.hits.length > 0 ||
    data.speedRecords.length > 0 ||
    data.flyCatchAttempts.length > 0 ||
    data.strikeJudgeCells.length > 0 ||
    data.throwPlays.length > 0
  );
}

export function collectSessionArchivePlayerIds(
  payload: SessionArchivePayload
): string[] {
  const data = normalizeSessionArchivePayload(payload);
  const ids = new Set<string>();

  for (const hit of data.hits) {
    if (hit.playerId) ids.add(hit.playerId);
  }
  for (const row of data.speedRecords) {
    if (row.playerId) ids.add(row.playerId);
  }
  for (const row of data.flyCatchAttempts) {
    if (row.playerId) ids.add(row.playerId);
  }
  for (const column of data.strikeJudgeColumns) {
    if (column.pitcherId) ids.add(column.pitcherId);
  }
  for (const cell of data.strikeJudgeCells) {
    if (cell.judgeId) ids.add(cell.judgeId);
  }
  for (const play of data.throwPlays) {
    if (play.throwerId) ids.add(play.throwerId);
    if (play.firstBaseId) ids.add(play.firstBaseId);
  }

  return [...ids];
}
