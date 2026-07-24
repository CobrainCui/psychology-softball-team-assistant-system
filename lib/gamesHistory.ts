// 历史归档读写：统一 migrate，避免页面各自 JSON.parse。

import { STORAGE_KEYS } from "@/lib/storageKeys";
import { safeParseJSON } from "@/lib/safeParse";
import {
  createGameArchive,
  migrateGameArchiveList,
  type GameArchive,
  type HitRecord,
  type SpeedRecord,
} from "@/lib/gameArchive";

export function loadGamesHistory(): GameArchive[] {
  const raw = localStorage.getItem(STORAGE_KEYS.gamesHistory);
  const parsed = safeParseJSON<unknown>(raw, []);
  return migrateGameArchiveList(parsed);
}

export function saveGamesHistory(history: GameArchive[]): void {
  localStorage.setItem(STORAGE_KEYS.gamesHistory, JSON.stringify(history));
}

export function appendGameArchive(
  hits: HitRecord[],
  speedRecords: SpeedRecord[]
): GameArchive {
  const archived = createGameArchive(hits, speedRecords);
  const history = loadGamesHistory();
  saveGamesHistory([...history, archived]);
  return archived;
}
