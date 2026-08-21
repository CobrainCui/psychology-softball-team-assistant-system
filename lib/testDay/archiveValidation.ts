// 测试日归档：空校验与 playerId 收集（actions 与 API 共用）

import {
  HIT_RESULT_VALUES,
  isHitRecord,
  isSpeedMark,
  type FlyCatchAttempt,
  type HitRecord,
  type SpeedColumn,
  type SpeedMark,
  type SpeedRecord,
  type StrikeJudgeCell,
  type StrikeJudgeColumn,
  type ThrowPlay,
} from "@/lib/gameArchive";
import type { Assignments } from "@/lib/sessionDraft";
import type { AssignmentCommit } from "@/lib/testDay/assignmentLog";
import {
  collectCustomTestPlayerIds,
  customTestSliceHasContent,
  parseCustomTestSlice,
  type CustomTestSlice,
} from "@/lib/testDay/customTests";
import { speedRecordsFromGrid } from "@/lib/testDay/speedGrid";

export type SessionArchivePayload = {
  hits: HitRecord[];
  speedRecords: SpeedRecord[];
  speedColumns?: SpeedColumn[];
  speedMarks?: SpeedMark[];
  flyCatchAttempts?: FlyCatchAttempt[];
  strikeJudgeColumns?: StrikeJudgeColumn[];
  strikeJudgeCells?: StrikeJudgeCell[];
  throwPlays?: ThrowPlay[];
  assignments?: Assignments;
  testItems?: string[];
  assignmentLog?: AssignmentCommit[];
  customTestDefs?: CustomTestSlice["customTestDefs"];
  customPlayerNotes?: CustomTestSlice["customPlayerNotes"];
  customGroupNotes?: CustomTestSlice["customGroupNotes"];
  customSingleNotes?: CustomTestSlice["customSingleNotes"];
};

export function normalizeSessionArchivePayload(
  payload: SessionArchivePayload
): Required<
  Pick<
    SessionArchivePayload,
    | "hits"
    | "speedRecords"
    | "speedColumns"
    | "speedMarks"
    | "flyCatchAttempts"
    | "strikeJudgeColumns"
    | "strikeJudgeCells"
    | "throwPlays"
    | "customTestDefs"
    | "customPlayerNotes"
    | "customGroupNotes"
    | "customSingleNotes"
  >
> {
  const custom = parseCustomTestSlice({
    customTestDefs: payload.customTestDefs,
    customPlayerNotes: payload.customPlayerNotes,
    customGroupNotes: payload.customGroupNotes,
    customSingleNotes: payload.customSingleNotes,
  });
  return {
    hits: Array.isArray(payload.hits) ? payload.hits : [],
    speedRecords: Array.isArray(payload.speedRecords) ? payload.speedRecords : [],
    speedColumns: Array.isArray(payload.speedColumns)
      ? payload.speedColumns
      : [],
    speedMarks: Array.isArray(payload.speedMarks) ? payload.speedMarks : [],
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
    customTestDefs: custom.customTestDefs,
    customPlayerNotes: custom.customPlayerNotes,
    customGroupNotes: custom.customGroupNotes,
    customSingleNotes: custom.customSingleNotes,
  };
}

// 推导步骤：任一类成绩有记录即可归档；空格不算
export function sessionArchiveHasContent(payload: SessionArchivePayload): boolean {
  const data = normalizeSessionArchivePayload(payload);
  return (
    data.hits.length > 0 ||
    data.speedRecords.length > 0 ||
    data.speedMarks.length > 0 ||
    data.flyCatchAttempts.length > 0 ||
    data.strikeJudgeCells.length > 0 ||
    data.throwPlays.length > 0 ||
    customTestSliceHasContent(data)
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
  for (const mark of data.speedMarks) {
    if (mark.playerId) ids.add(mark.playerId);
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
  for (const playerId of collectCustomTestPlayerIds(data)) {
    ids.add(playerId);
  }

  return [...ids];
}

const HIT_RESULT_SET: ReadonlySet<string> = new Set(HIT_RESULT_VALUES);

// 推导步骤：前端盘面 → 过滤非法打点/秒数 → 派生 speedRecords → 交给 saveTestSession
export function buildClientArchivePayload(input: {
  hits: HitRecord[];
  speedColumns: SpeedColumn[];
  speedMarks: SpeedMark[];
  flyCatchAttempts: FlyCatchAttempt[];
  strikeJudgeColumns: StrikeJudgeColumn[];
  strikeJudgeCells: StrikeJudgeCell[];
  throwPlays: ThrowPlay[];
  assignments: Assignments;
  testItems: string[];
  assignmentLog: AssignmentCommit[];
  customTestDefs?: CustomTestSlice["customTestDefs"];
  customPlayerNotes?: CustomTestSlice["customPlayerNotes"];
  customGroupNotes?: CustomTestSlice["customGroupNotes"];
  customSingleNotes?: CustomTestSlice["customSingleNotes"];
}): SessionArchivePayload {
  const speedMarks = Array.isArray(input.speedMarks)
    ? input.speedMarks.filter(isSpeedMark)
    : [];
  const hits = Array.isArray(input.hits)
    ? input.hits.filter(
        (hit) => isHitRecord(hit) && HIT_RESULT_SET.has(hit.result)
      )
    : [];
  return {
    hits,
    speedRecords: speedRecordsFromGrid(speedMarks),
    speedColumns: input.speedColumns,
    speedMarks,
    flyCatchAttempts: input.flyCatchAttempts,
    strikeJudgeColumns: input.strikeJudgeColumns,
    strikeJudgeCells: input.strikeJudgeCells,
    throwPlays: input.throwPlays,
    assignments: input.assignments,
    testItems: input.testItems,
    assignmentLog: input.assignmentLog,
    customTestDefs: input.customTestDefs,
    customPlayerNotes: input.customPlayerNotes,
    customGroupNotes: input.customGroupNotes,
    customSingleNotes: input.customSingleNotes,
  };
}
