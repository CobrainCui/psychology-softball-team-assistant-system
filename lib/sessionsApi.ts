// 测试日归档云端仓库：读取失败时回退本地历史。正式写入只走协作草稿归档。

import {
  migrateGameArchiveList,
  type GameArchive,
  type HitRecord,
  type SpeedRecord,
} from "@/lib/gameArchive";
import { loadGamesHistory, saveGamesHistory } from "@/lib/gamesHistory";
import type { DraftScope } from "@/lib/scopedStorage";
import { CLOUD_DRAFT_ARCHIVE_ONLY_ERROR } from "@/lib/testDay/archiveValidation";

// 推导步骤：拉云端归档 → 归一 GameArchive → 覆盖本地历史缓存
export async function fetchSessions(
  scope: DraftScope | null
): Promise<GameArchive[]> {
  try {
    const res = await fetch("/api/sessions");
    if (!res.ok) throw new Error(`sessions ${res.status}`);
    const data: unknown = await res.json();
    const sessions = migrateGameArchiveList(data);
    saveGamesHistory(scope, sessions);
    return sessions;
  } catch (error) {
    console.error("云端被拒:", error);
    return loadGamesHistory(scope);
  }
}

export async function archiveSessionToCloud(
  scope: DraftScope | null,
  hits: HitRecord[],
  speedRecords: SpeedRecord[]
): Promise<GameArchive | null> {
  void scope;
  void hits;
  void speedRecords;
  console.error("云端被拒:", CLOUD_DRAFT_ARCHIVE_ONLY_ERROR);
  return null;
}
