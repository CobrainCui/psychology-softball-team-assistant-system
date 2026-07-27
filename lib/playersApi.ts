// 名册云端仓库：API 为权威源；成功后回写 localStorage 作缓存。

import {
  loadPlayers,
  normalizePlayerRole,
  savePlayers,
  type Gender,
  type Player,
  type PlayerRole,
} from "@/lib/players";

function toPlayer(raw: unknown): Player | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.id !== "string" || typeof obj.name !== "string") return null;
  return {
    id: obj.id,
    name: obj.name,
    gender:
      obj.gender === "male" || obj.gender === "female"
        ? obj.gender
        : undefined,
    role: normalizePlayerRole(obj.role),
  };
}

// 推导步骤：请求云端名册 → 失败则回退本地缓存 → 成功则覆盖缓存
export async function fetchPlayers(): Promise<Player[]> {
  try {
    const res = await fetch("/api/players");
    if (!res.ok) throw new Error(`players ${res.status}`);
    const data: unknown = await res.json();
    if (!Array.isArray(data)) throw new Error("invalid players payload");
    const players = data
      .map(toPlayer)
      .filter((player): player is Player => player !== null);
    savePlayers(players);
    return players;
  } catch (error) {
    console.error("云端被拒:", error);
    return loadPlayers();
  }
}

export async function createPlayer(input: {
  name: string;
  gender: Gender;
  role: PlayerRole;
}): Promise<Player | null> {
  try {
    const res = await fetch("/api/players", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      console.error("云端被拒:", `players POST ${res.status}`);
      return null;
    }
    const player = toPlayer(await res.json());
    if (!player) return null;
    const next = [...loadPlayers().filter((p) => p.id !== player.id), player];
    savePlayers(next);
    return player;
  } catch (error) {
    console.error("云端被拒:", error);
    return null;
  }
}

export async function updatePlayer(
  id: string,
  patch: Partial<Pick<Player, "name" | "gender" | "role">>
): Promise<Player | null> {
  try {
    const res = await fetch(`/api/players/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      console.error("云端被拒:", `players PATCH ${res.status}`);
      return null;
    }
    const player = toPlayer(await res.json());
    if (!player) return null;
    savePlayers(
      loadPlayers().map((row) => (row.id === id ? player : row))
    );
    return player;
  } catch (error) {
    console.error("云端被拒:", error);
    return null;
  }
}
