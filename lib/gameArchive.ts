// 综合测试日数据契约：写入端 (测试清单) 与读取端 (个人档案) 共用唯一类型与迁移。

export const GAME_ARCHIVE_SCHEMA_VERSION = 3;

export type HitResult = "LD" | "FB" | "GB" | "PU" | "MISS";
export type PitchType = "FB" | "CB" | "SL" | "CH" | "OT";
export type HitQuality = "Hard" | "Medium" | "Soft";
export type PitchCall = "strike" | "ball";
export type ThrowBlame = "thrower" | "firstBase" | "both";
export type ThrowTestItem = "6-3传球" | "4-3传球";

export const THROW_TEST_ITEMS: readonly ThrowTestItem[] = ["6-3传球", "4-3传球"];

// 打点记录：x/y 为打点区相对百分比 (0-100)；挥空 (MISS) 无落点，x/y 留空
export interface HitRecord {
  id: string;
  x?: number;
  y?: number;
  result: HitResult;
  playerId: string;
  playerName: string;
  pitchType?: string;
  hitQuality?: string;
  timestamp: number;
}

export const SPEED_FIRST_BASE_COLUMN_ID = "firstBase";
export const SPEED_SECOND_BASE_COLUMN_ID = "secondBase";
export const SPEED_LEGACY_CUSTOM_COLUMN_ID = "legacyCustom";

export interface SpeedColumn {
  id: string;
  name: string;
  sortOrder: number;
}

export interface SpeedMark {
  id: string;
  playerId: string;
  playerName: string;
  columnId: string;
  seconds: number;
  timestamp: number;
}

// 上垒速度：三项耗时均可选填，null 表示该维度未测（档案 PR 仍读此结构）
export interface SpeedRecord {
  id: string;
  playerId: string;
  playerName: string;
  firstBaseSeconds: number | null;
  secondBaseSeconds: number | null;
  customSeconds: number | null;
  timestamp: number;
}

// 接高飞：每人可多球；caught=接住；note 选填
export interface FlyCatchAttempt {
  id: string;
  playerId: string;
  playerName: string;
  caught: boolean;
  note?: string;
  timestamp: number;
}

// 好球判断矩阵的一列：同一投手可出现多次（多次投球）
export interface StrikeJudgeColumn {
  id: string;
  pitcherId: string;
  pitcherName: string;
  sortOrder: number;
}

// 已填判断格；正确与否由 pitchCall × swung 派生，不落库
export interface StrikeJudgeCell {
  columnId: string;
  judgeId: string;
  judgeName: string;
  pitchCall: PitchCall;
  swung: boolean;
  timestamp: number;
}

// 6-3 / 4-3 一格一笔；失败时 blame 必填
export interface ThrowPlay {
  id: string;
  testItem: ThrowTestItem;
  throwerId: string;
  throwerName: string;
  firstBaseId: string;
  firstBaseName: string;
  success: boolean;
  blame?: ThrowBlame;
  note?: string;
  timestamp: number;
}

// 单场归档快照：schemaVersion 用于后续字段演进；旧版可能只有 data 而无 hits
export interface GameArchive {
  schemaVersion: number;
  gameId: number;
  date: string;
  hits: HitRecord[];
  speedRecords: SpeedRecord[];
  speedColumns: SpeedColumn[];
  speedMarks: SpeedMark[];
  flyCatchAttempts: FlyCatchAttempt[];
  strikeJudgeColumns: StrikeJudgeColumn[];
  strikeJudgeCells: StrikeJudgeCell[];
  throwPlays: ThrowPlay[];
  /** @deprecated 旧版打点字段，读取时由 migrate 归一到 hits */
  data?: HitRecord[];
}

export type SkillArchiveSlice = {
  speedColumns?: SpeedColumn[];
  speedMarks?: SpeedMark[];
  flyCatchAttempts: FlyCatchAttempt[];
  strikeJudgeColumns: StrikeJudgeColumn[];
  strikeJudgeCells: StrikeJudgeCell[];
  throwPlays: ThrowPlay[];
};

// 安全提取打点：优先 hits，回退旧版 data，杜绝对 undefined 调用数组方法
export function getSafeHits(game: {
  hits?: HitRecord[];
  data?: HitRecord[];
}): HitRecord[] {
  return game.hits ?? game.data ?? [];
}

export function getSafeSpeedRecords(game: {
  speedRecords?: SpeedRecord[];
}): SpeedRecord[] {
  return game.speedRecords ?? [];
}

export function getSafeSpeedColumns(game: {
  speedColumns?: SpeedColumn[];
}): SpeedColumn[] {
  return game.speedColumns ?? [];
}

export function getSafeSpeedMarks(game: {
  speedMarks?: SpeedMark[];
}): SpeedMark[] {
  return game.speedMarks ?? [];
}

export function getSafeFlyCatchAttempts(game: {
  flyCatchAttempts?: FlyCatchAttempt[];
}): FlyCatchAttempt[] {
  return game.flyCatchAttempts ?? [];
}

export function getSafeStrikeJudgeColumns(game: {
  strikeJudgeColumns?: StrikeJudgeColumn[];
}): StrikeJudgeColumn[] {
  return game.strikeJudgeColumns ?? [];
}

export function getSafeStrikeJudgeCells(game: {
  strikeJudgeCells?: StrikeJudgeCell[];
}): StrikeJudgeCell[] {
  return game.strikeJudgeCells ?? [];
}

export function getSafeThrowPlays(game: {
  throwPlays?: ThrowPlay[];
}): ThrowPlay[] {
  return game.throwPlays ?? [];
}

export function isHitRecord(value: unknown): value is HitRecord {
  if (!value || typeof value !== "object") return false;
  const hit = value as Record<string, unknown>;
  return (
    typeof hit.id === "string" &&
    typeof hit.result === "string" &&
    typeof hit.playerId === "string" &&
    typeof hit.playerName === "string" &&
    typeof hit.timestamp === "number"
  );
}

export function isSpeedRecord(value: unknown): value is SpeedRecord {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === "string" &&
    typeof row.playerId === "string" &&
    typeof row.playerName === "string" &&
    typeof row.timestamp === "number"
  );
}

export function isSpeedColumn(value: unknown): value is SpeedColumn {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === "string" &&
    typeof row.name === "string" &&
    typeof row.sortOrder === "number"
  );
}

export function isSpeedMark(value: unknown): value is SpeedMark {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === "string" &&
    typeof row.playerId === "string" &&
    typeof row.playerName === "string" &&
    typeof row.columnId === "string" &&
    typeof row.seconds === "number" &&
    Number.isFinite(row.seconds) &&
    row.seconds >= 0 &&
    typeof row.timestamp === "number"
  );
}

export function asPitchCall(value: unknown): PitchCall | null {
  return value === "strike" || value === "ball" ? value : null;
}

export function asThrowBlame(value: unknown): ThrowBlame | null {
  return value === "thrower" || value === "firstBase" || value === "both"
    ? value
    : null;
}

export function asThrowTestItem(value: unknown): ThrowTestItem | null {
  return value === "6-3传球" || value === "4-3传球" ? value : null;
}

export function isFlyCatchAttempt(value: unknown): value is FlyCatchAttempt {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === "string" &&
    typeof row.playerId === "string" &&
    typeof row.playerName === "string" &&
    typeof row.caught === "boolean" &&
    typeof row.timestamp === "number"
  );
}

export function isStrikeJudgeColumn(value: unknown): value is StrikeJudgeColumn {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === "string" &&
    typeof row.pitcherId === "string" &&
    typeof row.pitcherName === "string" &&
    typeof row.sortOrder === "number"
  );
}

export function isStrikeJudgeCell(value: unknown): value is StrikeJudgeCell {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.columnId === "string" &&
    typeof row.judgeId === "string" &&
    typeof row.judgeName === "string" &&
    asPitchCall(row.pitchCall) !== null &&
    typeof row.swung === "boolean" &&
    typeof row.timestamp === "number"
  );
}

export function isThrowPlay(value: unknown): value is ThrowPlay {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  if (asThrowTestItem(row.testItem) === null) return false;
  if (row.success === false && asThrowBlame(row.blame) === null) return false;
  return (
    typeof row.id === "string" &&
    typeof row.throwerId === "string" &&
    typeof row.throwerName === "string" &&
    typeof row.firstBaseId === "string" &&
    typeof row.firstBaseName === "string" &&
    typeof row.success === "boolean" &&
    typeof row.timestamp === "number"
  );
}

function filterTyped<T>(
  raw: unknown,
  guard: (value: unknown) => value is T
): T[] {
  return Array.isArray(raw) ? raw.filter(guard) : [];
}

// 推导步骤：识别原始对象 → 归一 hits/speed/技能表 → 缺字段当空数组
export function migrateGameArchive(raw: unknown): GameArchive | null {
  if (!raw || typeof raw !== "object") return null;

  const obj = raw as Record<string, unknown>;
  const gameId = typeof obj.gameId === "number" ? obj.gameId : null;
  const date = typeof obj.date === "string" ? obj.date : null;
  if (gameId === null || date === null) return null;

  const hits = getSafeHits({
    hits: Array.isArray(obj.hits) ? (obj.hits as HitRecord[]) : undefined,
    data: Array.isArray(obj.data) ? (obj.data as HitRecord[]) : undefined,
  }).filter(isHitRecord);
  const speedRecords = getSafeSpeedRecords({
    speedRecords: Array.isArray(obj.speedRecords)
      ? (obj.speedRecords as SpeedRecord[])
      : undefined,
  }).filter(isSpeedRecord);

  return {
    schemaVersion:
      typeof obj.schemaVersion === "number"
        ? obj.schemaVersion
        : GAME_ARCHIVE_SCHEMA_VERSION,
    gameId,
    date,
    hits,
    speedRecords,
    speedColumns: filterTyped(obj.speedColumns, isSpeedColumn),
    speedMarks: filterTyped(obj.speedMarks, isSpeedMark),
    flyCatchAttempts: filterTyped(obj.flyCatchAttempts, isFlyCatchAttempt),
    strikeJudgeColumns: filterTyped(
      obj.strikeJudgeColumns,
      isStrikeJudgeColumn
    ),
    strikeJudgeCells: filterTyped(obj.strikeJudgeCells, isStrikeJudgeCell),
    throwPlays: filterTyped(obj.throwPlays, isThrowPlay),
  };
}

export function migrateGameArchiveList(raw: unknown): GameArchive[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map(migrateGameArchive)
    .filter((game): game is GameArchive => game !== null);
}

export function emptySkillArchiveSlice(): SkillArchiveSlice {
  return {
    flyCatchAttempts: [],
    strikeJudgeColumns: [],
    strikeJudgeCells: [],
    throwPlays: [],
  };
}

export function createGameArchive(
  hits: HitRecord[],
  speedRecords: SpeedRecord[],
  skills: SkillArchiveSlice = emptySkillArchiveSlice()
): GameArchive {
  return {
    schemaVersion: GAME_ARCHIVE_SCHEMA_VERSION,
    gameId: Date.now(),
    date: new Date().toISOString(),
    hits,
    speedRecords,
    speedColumns: skills.speedColumns ?? [],
    speedMarks: skills.speedMarks ?? [],
    flyCatchAttempts: skills.flyCatchAttempts,
    strikeJudgeColumns: skills.strikeJudgeColumns,
    strikeJudgeCells: skills.strikeJudgeCells,
    throwPlays: skills.throwPlays,
  };
}
