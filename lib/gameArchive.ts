// 综合测试日数据契约：写入端 (测试清单) 与读取端 (个人档案) 共用唯一类型与迁移。

export const GAME_ARCHIVE_SCHEMA_VERSION = 1;

export type HitResult = "LD" | "FB" | "GB" | "PU" | "MISS";
export type PitchType = "FB" | "CB" | "SL" | "CH" | "OT";
export type HitQuality = "Hard" | "Medium" | "Soft";

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

// 上垒速度：三项耗时均可选填，null 表示该维度未测
export interface SpeedRecord {
  id: string;
  playerId: string;
  playerName: string;
  firstBaseSeconds: number | null;
  secondBaseSeconds: number | null;
  customSeconds: number | null;
  timestamp: number;
}

// 单场归档快照：schemaVersion 用于后续字段演进；旧版可能只有 data 而无 hits
export interface GameArchive {
  schemaVersion: number;
  gameId: number;
  date: string;
  hits: HitRecord[];
  speedRecords: SpeedRecord[];
  /** @deprecated 旧版打点字段，读取时由 migrate 归一到 hits */
  data?: HitRecord[];
}

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

// 推导步骤：识别原始对象 → 归一 hits/speedRecords → 补齐 schemaVersion
export function migrateGameArchive(raw: unknown): GameArchive | null {
  if (!raw || typeof raw !== "object") return null;

  const obj = raw as Record<string, unknown>;
  const gameId = typeof obj.gameId === "number" ? obj.gameId : null;
  const date = typeof obj.date === "string" ? obj.date : null;
  if (gameId === null || date === null) return null;

  const hits = getSafeHits({
    hits: Array.isArray(obj.hits) ? (obj.hits as HitRecord[]) : undefined,
    data: Array.isArray(obj.data) ? (obj.data as HitRecord[]) : undefined,
  });
  const speedRecords = getSafeSpeedRecords({
    speedRecords: Array.isArray(obj.speedRecords)
      ? (obj.speedRecords as SpeedRecord[])
      : undefined,
  });

  return {
    schemaVersion:
      typeof obj.schemaVersion === "number"
        ? obj.schemaVersion
        : GAME_ARCHIVE_SCHEMA_VERSION,
    gameId,
    date,
    hits,
    speedRecords,
  };
}

export function migrateGameArchiveList(raw: unknown): GameArchive[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map(migrateGameArchive)
    .filter((game): game is GameArchive => game !== null);
}

export function createGameArchive(
  hits: HitRecord[],
  speedRecords: SpeedRecord[]
): GameArchive {
  return {
    schemaVersion: GAME_ARCHIVE_SCHEMA_VERSION,
    gameId: Date.now(),
    date: new Date().toISOString(),
    hits,
    speedRecords,
  };
}
