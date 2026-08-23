// 测试日归档云端仓库：交卷写库；读取失败时回退本地历史。

import {
  migrateGameArchive,
  migrateGameArchiveList,
  type GameArchive,
  type HitRecord,
  type SpeedRecord,
} from "@/lib/gameArchive";
import { loadGamesHistory, saveGamesHistory } from "@/lib/gamesHistory";
import type { DraftScope } from "@/lib/scopedStorage";

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

// 推导步骤：POST 云端 → 成功后把返回快照追加进本地缓存（云端失败则不交卷）
export async function archiveSessionToCloud(
  scope: DraftScope | null,
  hits: HitRecord[],
  speedRecords: SpeedRecord[]
): Promise<GameArchive | null> {
  try {
    const res = await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hits, speedRecords }),
    });
    if (!res.ok) {
      console.error("云端被拒:", `sessions POST ${res.status}`);
      return null;
    }
    const archived = migrateGameArchive(await res.json());
    if (!archived) return null;
    saveGamesHistory(scope, [...loadGamesHistory(scope), archived]);
    return archived;
  } catch (error) {
    console.error("云端被拒:", error);
    return null;
  }
}
