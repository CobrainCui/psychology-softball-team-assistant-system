// 全局使用者身份契约：/login 负责写入，Navbar 与各功能页面负责读取。
// 身份切换现在只通过整页跳转 (window.location.href) 完成，因此不再需要
// 跨组件的事件广播机制，保持最小实现。

import { useSyncExternalStore } from "react";
import {
  Gender,
  normalizePlayerRole,
  type PlayerRole,
} from "./players";
import { STORAGE_KEYS } from "@/lib/storageKeys";
import { safeParseJSON } from "@/lib/safeParse";

export const CURRENT_USER_STORAGE_KEY = STORAGE_KEYS.currentUser;

export interface CurrentUser {
  playerId: string;
  playerName: string;
  gender: Gender;
  role: PlayerRole;
}

function normalizeCurrentUser(raw: unknown): CurrentUser | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  if (
    typeof obj.playerId !== "string" ||
    typeof obj.playerName !== "string" ||
    (obj.gender !== "male" && obj.gender !== "female")
  ) {
    return null;
  }
  return {
    playerId: obj.playerId,
    playerName: obj.playerName,
    gender: obj.gender,
    role: normalizePlayerRole(obj.role),
  };
}

export function getStoredCurrentUser(): CurrentUser | null {
  const stored = localStorage.getItem(CURRENT_USER_STORAGE_KEY);
  if (!stored) return null;
  return normalizeCurrentUser(safeParseJSON<unknown>(stored, null));
}

export function setStoredCurrentUser(user: CurrentUser): void {
  localStorage.setItem(
    CURRENT_USER_STORAGE_KEY,
    JSON.stringify({
      ...user,
      role: normalizePlayerRole(user.role),
    })
  );
}

export function clearStoredCurrentUser(): void {
  localStorage.removeItem(CURRENT_USER_STORAGE_KEY);
}

const noopSubscribe = () => () => {};

const getRawSnapshot = () => localStorage.getItem(CURRENT_USER_STORAGE_KEY);
const getServerSnapshot = () => null;

export function useCurrentUser() {
  const raw = useSyncExternalStore(noopSubscribe, getRawSnapshot, getServerSnapshot);
  const isMounted = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false
  );

  let currentUser: CurrentUser | null = null;
  if (raw) {
    currentUser = normalizeCurrentUser(safeParseJSON<unknown>(raw, null));
  }

  return { currentUser, isMounted };
}
