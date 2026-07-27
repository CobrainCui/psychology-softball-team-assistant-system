// 全局共享的球员名册数据结构，供计分引擎页面、登录注册页与全局导航栏共用，
// 避免多处各自维护一份 Player 类型与 localStorage key 造成数据契约不一致。

import { STORAGE_KEYS } from "@/lib/storageKeys";
import { safeParseJSON } from "@/lib/safeParse";

export const PLAYERS_STORAGE_KEY = STORAGE_KEYS.players;

export type Gender = "male" | "female";

/** 与 Prisma PlayerRole 对齐；旧名册缺省视为 player */
export type PlayerRole = "player" | "coach";

export interface Player {
  id: string;
  name: string;
  // 早期测试队员未采集性别，故设为可选，避免历史数据解析失败
  gender?: Gender;
  role?: PlayerRole;
}

// 无默认种子队员；名册由登录页 / 侧边栏新建写入云端
export const DEFAULT_PLAYERS: Player[] = [];

export function normalizePlayerRole(role: unknown): PlayerRole {
  return role === "coach" ? "coach" : "player";
}

export function loadPlayers(): Player[] {
  const raw = localStorage.getItem(PLAYERS_STORAGE_KEY);
  if (!raw) return [];
  const parsed = safeParseJSON<unknown>(raw, null);
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter(
      (item): item is Player =>
        Boolean(item) &&
        typeof item === "object" &&
        typeof (item as Player).id === "string" &&
        typeof (item as Player).name === "string"
    )
    .map((player) => ({
      ...player,
      role: normalizePlayerRole(player.role),
    }));
}

export function savePlayers(players: Player[]): void {
  localStorage.setItem(PLAYERS_STORAGE_KEY, JSON.stringify(players));
}
