// 测试日归档云端仓库：交卷写库；读取失败时回退本地历史。

import {
  migrateGameArchive,
  migrateGameArchiveList,
  type GameArchive,
  type HitRecord,
  type SpeedRecord,
} from "@/lib/gameArchive";
import { loadGamesHistory, saveGamesHistory } from "@/lib/gamesHistory";

// 推导步骤：拉云端归档 → 归一 GameArchive → 覆盖本地历史缓存
export async function fetchSessions(): Promise<GameArchive[]> {
  try {
    const res = await fetch("/api/sessions");
    if (!res.ok) throw new Error(`sessions ${res.status}`);
    const data: unknown = await res.json();
    const sessions = migrateGameArchiveList(data);
    saveGamesHistory(sessions);
    return sessions;
  } catch (error) {
    console.error("云端被拒:", error);
    return loadGamesHistory();
  }
}

// 推导步骤：POST 云端 → 成功后把返回快照追加进本地缓存（云端失败则不交卷）
export async function archiveSessionToCloud(
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
    saveGamesHistory([...loadGamesHistory(), archived]);
    return archived;
  } catch (error) {
    console.error("云端被拒:", error);
    return null;
  }
}
