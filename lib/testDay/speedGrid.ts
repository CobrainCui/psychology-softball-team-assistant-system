// 上垒速度表格：默认上一垒/上二垒；额外列记秒数；旧 SpeedRecord 迁入格子。

import {
  SPEED_FIRST_BASE_COLUMN_ID,
  SPEED_LEGACY_CUSTOM_COLUMN_ID,
  SPEED_SECOND_BASE_COLUMN_ID,
  type SpeedColumn,
  type SpeedMark,
  type SpeedRecord,
} from "@/lib/gameArchive";

export function createDefaultSpeedColumns(): SpeedColumn[] {
  return [
    { id: SPEED_FIRST_BASE_COLUMN_ID, name: "上一垒", sortOrder: 0 },
    { id: SPEED_SECOND_BASE_COLUMN_ID, name: "上二垒", sortOrder: 1 },
  ];
}

export function isDefaultSpeedColumnId(columnId: string): boolean {
  return (
    columnId === SPEED_FIRST_BASE_COLUMN_ID ||
    columnId === SPEED_SECOND_BASE_COLUMN_ID
  );
}

// 推导步骤：缺默认列则补上，sortOrder 按现有顺序重排
export function ensureDefaultSpeedColumns(
  columns: SpeedColumn[]
): SpeedColumn[] {
  const seen = new Set(columns.map((column) => column.id));
  const next = [...columns];
  for (const def of createDefaultSpeedColumns()) {
    if (!seen.has(def.id)) next.push(def);
  }
  return next
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((column, index) => ({ ...column, sortOrder: index }));
}

export function parseSpeedSeconds(raw: string): number | null {
  if (raw.trim() === "") return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function pushMark(
  marks: SpeedMark[],
  row: SpeedRecord,
  columnId: string,
  seconds: number | null
) {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return;
  marks.push({
    id: `${row.id}:${columnId}`,
    playerId: row.playerId,
    playerName: row.playerName,
    columnId,
    seconds,
    timestamp: row.timestamp,
  });
}

export function speedMarksFromLegacyRecords(
  records: SpeedRecord[]
): { columns: SpeedColumn[]; marks: SpeedMark[] } {
  const columns = createDefaultSpeedColumns();
  const marks: SpeedMark[] = [];
  let hasLegacyCustom = false;

  for (const row of records) {
    pushMark(marks, row, SPEED_FIRST_BASE_COLUMN_ID, row.firstBaseSeconds);
    pushMark(marks, row, SPEED_SECOND_BASE_COLUMN_ID, row.secondBaseSeconds);
    if (
      typeof row.customSeconds === "number" &&
      Number.isFinite(row.customSeconds) &&
      row.customSeconds >= 0
    ) {
      hasLegacyCustom = true;
      pushMark(marks, row, SPEED_LEGACY_CUSTOM_COLUMN_ID, row.customSeconds);
    }
  }

  if (hasLegacyCustom) {
    columns.push({
      id: SPEED_LEGACY_CUSTOM_COLUMN_ID,
      name: "自定义",
      sortOrder: columns.length,
    });
  }

  return { columns, marks };
}

export function speedRecordsFromGrid(
  marks: SpeedMark[]
): SpeedRecord[] {
  const grouped = new Map<string, SpeedMark[]>();
  for (const mark of marks) {
    const current = grouped.get(mark.playerId) ?? [];
    current.push(mark);
    grouped.set(mark.playerId, current);
  }

  const records: SpeedRecord[] = [];
  for (const [playerId, playerMarks] of grouped) {
    const first = playerMarks.find(
      (mark) => mark.columnId === SPEED_FIRST_BASE_COLUMN_ID
    );
    const second = playerMarks.find(
      (mark) => mark.columnId === SPEED_SECOND_BASE_COLUMN_ID
    );
    const latest = playerMarks.reduce((acc, mark) =>
      mark.timestamp > acc.timestamp ? mark : acc
    );
    records.push({
      id: latest.id,
      playerId,
      playerName: latest.playerName,
      firstBaseSeconds: first?.seconds ?? null,
      secondBaseSeconds: second?.seconds ?? null,
      customSeconds: null,
      timestamp: latest.timestamp,
    });
  }
  return records;
}

export function resolveSpeedGrid(
  columns: SpeedColumn[],
  marks: SpeedMark[],
  legacyRecords: SpeedRecord[]
): { columns: SpeedColumn[]; marks: SpeedMark[] } {
  if (columns.length > 0 || marks.length > 0) {
    return {
      columns: ensureDefaultSpeedColumns(columns),
      marks,
    };
  }
  if (legacyRecords.length > 0) {
    const migrated = speedMarksFromLegacyRecords(legacyRecords);
    return {
      columns: ensureDefaultSpeedColumns(migrated.columns),
      marks: migrated.marks,
    };
  }
  return { columns: createDefaultSpeedColumns(), marks: [] };
}
