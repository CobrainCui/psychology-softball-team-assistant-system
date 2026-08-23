// 历史归档读写：统一 migrate，避免页面各自 JSON.parse。

import { STORAGE_KEYS } from "@/lib/storageKeys";
import { safeParseJSON } from "@/lib/safeParse";
import {
  readScopedItem,
  writeScopedItem,
  type DraftScope,
} from "@/lib/scopedStorage";
import {
  createGameArchive,
  migrateGameArchiveList,
  type GameArchive,
  type HitRecord,
  type SpeedRecord,
} from "@/lib/gameArchive";

export function loadGamesHistory(scope: DraftScope | null): GameArchive[] {
  const raw = readScopedItem(STORAGE_KEYS.gamesHistory, scope);
  const parsed = safeParseJSON<unknown>(raw, []);
  return migrateGameArchiveList(parsed);
}

export function saveGamesHistory(
  scope: DraftScope | null,
  history: GameArchive[]
): void {
  writeScopedItem(STORAGE_KEYS.gamesHistory, scope, JSON.stringify(history));
}

export function appendGameArchive(
  scope: DraftScope | null,
  hits: HitRecord[],
  speedRecords: SpeedRecord[]
): GameArchive {
  const archived = createGameArchive(hits, speedRecords);
  const history = loadGamesHistory(scope);
  saveGamesHistory(scope, [...history, archived]);
  return archived;
}
