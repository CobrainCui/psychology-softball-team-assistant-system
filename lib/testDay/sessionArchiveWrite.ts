// 测试日归档 → Prisma create 输入（Server Action 与 Route Handler 共用）

import {
  GAME_ARCHIVE_SCHEMA_VERSION,
  asPitchCall,
  asThrowBlame,
  asThrowTestItem,
} from "@/lib/gameArchive";
import {
  asHitQuality,
  asHitResult,
  asPitchType,
} from "@/lib/sessionMapper";
import {
  normalizeSessionArchivePayload,
  type SessionArchivePayload,
} from "@/lib/testDay/archiveValidation";
import { compactCustomTestSliceForArchive } from "@/lib/testDay/customTests";
import { Prisma } from "@/lib/generated/prisma/client";

function toJsonField(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function toFloatOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

export function buildTestSessionCreateInput(
  payload: SessionArchivePayload,
  teamId: string,
  archivedAt: Date
): Prisma.TestSessionUncheckedCreateInput {
  const data = normalizeSessionArchivePayload(payload);

  const hitCreates = data.hits.map((hit, index) => {
    if (typeof hit.playerId !== "string" || !hit.playerId) {
      throw new Error(`第 ${index + 1} 条打点缺少 playerId`);
    }
    const result = asHitResult(hit.result);
    if (!result) {
      throw new Error(
        `第 ${index + 1} 条打点 result 无效: ${String(hit.result)}`
      );
    }
    return {
      playerId: hit.playerId,
      result,
      pitchType: asPitchType(hit.pitchType),
      hitQuality: asHitQuality(hit.hitQuality),
      x: toFloatOrNull(hit.x),
      y: toFloatOrNull(hit.y),
      recordedAt: archivedAt,
    };
  });

  const speedCreates = data.speedRecords.map((row, index) => {
    if (typeof row.playerId !== "string" || !row.playerId) {
      throw new Error(`第 ${index + 1} 条测速缺少 playerId`);
    }
    return {
      playerId: row.playerId,
      firstBaseSeconds: toFloatOrNull(row.firstBaseSeconds),
      secondBaseSeconds: toFloatOrNull(row.secondBaseSeconds),
      customSeconds: toFloatOrNull(row.customSeconds),
      recordedAt: archivedAt,
    };
  });

  // 盘面列 id（firstBase 等）全库会重复；落库主键另发，boardColumnId 保留盘面 id
  const boardToPersistId = new Map<string, string>();
  const speedColumnCreates = data.speedColumns.map((column, index) => {
    if (typeof column.id !== "string" || !column.id) {
      throw new Error(`第 ${index + 1} 列跑垒缺少 id`);
    }
    if (typeof column.name !== "string" || !column.name.trim()) {
      throw new Error(`第 ${index + 1} 列跑垒缺少名称`);
    }
    const persistId = crypto.randomUUID();
    boardToPersistId.set(column.id, persistId);
    return {
      id: persistId,
      boardColumnId: column.id,
      name: column.name.trim(),
      sortOrder:
        typeof column.sortOrder === "number" ? column.sortOrder : index,
      recordedAt: archivedAt,
    };
  });

  const speedMarkCreates = data.speedMarks.map((mark, index) => {
    const seconds = toFloatOrNull(mark.seconds);
    const persistColumnId = mark.columnId
      ? boardToPersistId.get(mark.columnId)
      : undefined;
    if (
      typeof mark.playerId !== "string" ||
      !mark.playerId ||
      typeof mark.columnId !== "string" ||
      !mark.columnId ||
      persistColumnId === undefined ||
      seconds === null ||
      seconds < 0
    ) {
      throw new Error(`第 ${index + 1} 条跑垒秒数无效`);
    }
    return {
      columnId: persistColumnId,
      playerId: mark.playerId,
      seconds,
      recordedAt: archivedAt,
    };
  });

  const flyCatchCreates = data.flyCatchAttempts.map((row, index) => {
    if (typeof row.playerId !== "string" || !row.playerId) {
      throw new Error(`第 ${index + 1} 条接高飞缺少 playerId`);
    }
    return {
      playerId: row.playerId,
      caught: row.caught,
      note:
        typeof row.note === "string" && row.note.trim() ? row.note.trim() : null,
      recordedAt: archivedAt,
    };
  });

  const strikeColumnCreates = data.strikeJudgeColumns.map((column, index) => {
    if (typeof column.pitcherId !== "string" || !column.pitcherId) {
      throw new Error(`第 ${index + 1} 列投手缺少 pitcherId`);
    }
    return {
      id: column.id,
      pitcherId: column.pitcherId,
      sortOrder:
        typeof column.sortOrder === "number" ? column.sortOrder : index,
      recordedAt: archivedAt,
    };
  });

  const strikeCellCreates = data.strikeJudgeCells.map((cell, index) => {
    const pitchCall = asPitchCall(cell.pitchCall);
    if (
      typeof cell.columnId !== "string" ||
      !cell.columnId ||
      typeof cell.judgeId !== "string" ||
      !cell.judgeId ||
      pitchCall === null ||
      typeof cell.swung !== "boolean"
    ) {
      throw new Error(`第 ${index + 1} 条好球判断格无效`);
    }
    return {
      columnId: cell.columnId,
      judgeId: cell.judgeId,
      pitchCall,
      swung: cell.swung,
      recordedAt: archivedAt,
    };
  });

  const throwCreates = data.throwPlays.map((play, index) => {
    const testItem = asThrowTestItem(play.testItem);
    if (
      testItem === null ||
      typeof play.throwerId !== "string" ||
      !play.throwerId ||
      typeof play.firstBaseId !== "string" ||
      !play.firstBaseId ||
      typeof play.success !== "boolean"
    ) {
      throw new Error(`第 ${index + 1} 条传球无效`);
    }
    if (!play.success && asThrowBlame(play.blame) === null) {
      throw new Error(`第 ${index + 1} 条传球失败须指定责任`);
    }
    return {
      testItem,
      throwerId: play.throwerId,
      firstBaseId: play.firstBaseId,
      success: play.success,
      blame: play.success ? null : asThrowBlame(play.blame),
      note:
        typeof play.note === "string" && play.note.trim()
          ? play.note.trim()
          : null,
      recordedAt: archivedAt,
    };
  });

  return {
    teamId,
    schemaVersion: GAME_ARCHIVE_SCHEMA_VERSION,
    archivedAt,
    assignments: toJsonField(payload.assignments),
    testItems: toJsonField(payload.testItems),
    assignmentLog: toJsonField(payload.assignmentLog),
    customTests: toJsonField(compactCustomTestSliceForArchive(data)),
    hits: hitCreates.length > 0 ? { create: hitCreates } : undefined,
    speedRecords:
      speedCreates.length > 0 ? { create: speedCreates } : undefined,
    speedColumns:
      speedMarkCreates.length > 0 && speedColumnCreates.length > 0
        ? { create: speedColumnCreates }
        : undefined,
    speedMarks:
      speedMarkCreates.length > 0 ? { create: speedMarkCreates } : undefined,
    flyCatchAttempts:
      flyCatchCreates.length > 0 ? { create: flyCatchCreates } : undefined,
    strikeJudgeColumns:
      strikeColumnCreates.length > 0
        ? { create: strikeColumnCreates }
        : undefined,
    strikeJudgeCells:
      strikeCellCreates.length > 0 ? { create: strikeCellCreates } : undefined,
    throwPlays: throwCreates.length > 0 ? { create: throwCreates } : undefined,
  };
}
