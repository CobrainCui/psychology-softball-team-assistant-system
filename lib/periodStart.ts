// 女性队员经期开始日本地缓存：按 playerId 存，避免每次评估重填。

import { STORAGE_KEYS } from "@/lib/storageKeys";
import { safeParseJSON } from "@/lib/safeParse";

type PeriodStartMap = Record<string, string>;

function loadMap(): PeriodStartMap {
  const raw = localStorage.getItem(STORAGE_KEYS.periodStartByPlayer);
  const parsed = safeParseJSON<unknown>(raw, {});
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  const map: PeriodStartMap = {};
  for (const [playerId, date] of Object.entries(parsed)) {
    if (typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      map[playerId] = date;
    }
  }
  return map;
}

export function getPeriodStartDate(playerId: string): string {
  return loadMap()[playerId] ?? "";
}

export function setPeriodStartDate(playerId: string, date: string): void {
  const map = loadMap();
  if (!date) {
    delete map[playerId];
  } else {
    map[playerId] = date;
  }
  localStorage.setItem(STORAGE_KEYS.periodStartByPlayer, JSON.stringify(map));
}
