// 全局使用者身份契约：/login 负责写入，Navbar 与各功能页面负责读取。
// 身份切换现在只通过整页跳转 (window.location.href) 完成，因此不再需要
// 跨组件的事件广播机制，保持最小实现。

import { useSyncExternalStore } from "react";
import { Gender } from "./players";
import { STORAGE_KEYS } from "@/lib/storageKeys";
import { safeParseJSON } from "@/lib/safeParse";

export const CURRENT_USER_STORAGE_KEY = STORAGE_KEYS.currentUser;

export interface CurrentUser {
  playerId: string;
  playerName: string;
  gender: Gender;
}

export function getStoredCurrentUser(): CurrentUser | null {
  const stored = localStorage.getItem(CURRENT_USER_STORAGE_KEY);
  if (!stored) return null;
  return safeParseJSON<CurrentUser | null>(stored, null);
}

// 身份写入永久生效：仅落盘 localStorage，不附带任何 TTL/过期时间戳，
// 避免出现"账号过期"这类不应存在的伪需求。
export function setStoredCurrentUser(user: CurrentUser): void {
  localStorage.setItem(CURRENT_USER_STORAGE_KEY, JSON.stringify(user));
}

// 退出登录：仅清除当前身份这一个 key，球员名册与历史打点数据不受影响。
export function clearStoredCurrentUser(): void {
  localStorage.removeItem(CURRENT_USER_STORAGE_KEY);
}

// 无需订阅：身份切换只通过整页跳转完成 (见文件头注释)，本 Hook 只负责在挂载后
// 安全读取一次 localStorage，不需要监听后续变化。
const noopSubscribe = () => () => {};

// 快照返回原始字符串而非解析后的对象：useSyncExternalStore 用 Object.is 比较
// 快照是否变化，字符串是值类型不会触发无谓的重渲染；对象每次 JSON.parse 都是
// 新引用，会被误判为"变化"从而死循环。
const getRawSnapshot = () => localStorage.getItem(CURRENT_USER_STORAGE_KEY);
const getServerSnapshot = () => null;

// 共享的身份读取 Hook：用 useSyncExternalStore 读取外部存储 (localStorage)，
// 服务端快照恒为 null、客户端快照为挂载后的真实值，天然避免 Hydration 不一致，
// 且不落入"在 effect 中同步调用 setState"这一反模式。
export function useCurrentUser() {
  const raw = useSyncExternalStore(noopSubscribe, getRawSnapshot, getServerSnapshot);
  const isMounted = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false
  );

  let currentUser: CurrentUser | null = null;
  if (raw) {
    currentUser = safeParseJSON<CurrentUser | null>(raw, null);
  }

  return { currentUser, isMounted };
}
