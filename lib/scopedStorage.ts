import { STORAGE_KEYS } from "@/lib/storageKeys";

export type DraftScope = {
  teamId: string;
  accountId: string;
};

/** 单机当场草稿槽；不是云端协作 draftId */
export const LIVE_DRAFT_SLOT = "live";

const UNSCOPED_DROP = [
  STORAGE_KEYS.sessionDraft,
  STORAGE_KEYS.hitsLegacy,
  STORAGE_KEYS.gamesHistory,
  STORAGE_KEYS.readinessHistory,
  STORAGE_KEYS.injuryCases,
  STORAGE_KEYS.sessionFeedback,
  STORAGE_KEYS.periodStartByPlayer,
  STORAGE_KEYS.syncOutbox,
] as const;

const ACCOUNT_DRAFT_BASES = [
  STORAGE_KEYS.sessionDraft,
  STORAGE_KEYS.gamesHistory,
  STORAGE_KEYS.readinessHistory,
  STORAGE_KEYS.injuryCases,
  STORAGE_KEYS.sessionFeedback,
  STORAGE_KEYS.syncOutbox,
] as const;

export function scopedKey(
  base: string,
  scope: DraftScope,
  slot?: string
): string {
  const key = `${base}:${scope.teamId}:${scope.accountId}`;
  return slot ? `${key}:${slot}` : key;
}

export function sessionDraftLiveKey(scope: DraftScope): string {
  return scopedKey(STORAGE_KEYS.sessionDraft, scope, LIVE_DRAFT_SLOT);
}

export function sessionDraftLegacyKey(scope: DraftScope): string {
  return scopedKey(STORAGE_KEYS.sessionDraft, scope);
}

/** 推导步骤：已有 :live 用新键；否则把旧两段键升上去并删旧键。无后缀全局 key 不认领。 */
export function resolveLiveDraftMigration(
  liveRaw: string | null,
  legacyRaw: string | null
): { value: string | null; writeLive: boolean; dropLegacy: boolean } {
  if (liveRaw != null) {
    return {
      value: liveRaw,
      writeLive: false,
      dropLegacy: legacyRaw != null,
    };
  }
  if (legacyRaw != null) {
    return { value: legacyRaw, writeLive: true, dropLegacy: true };
  }
  return { value: null, writeLive: false, dropLegacy: false };
}

export function readSessionDraftItem(scope: DraftScope | null): string | null {
  dropUnscopedBusinessKeys();
  if (!scope) return null;
  const liveKey = sessionDraftLiveKey(scope);
  const legacyKey = sessionDraftLegacyKey(scope);
  const resolved = resolveLiveDraftMigration(
    localStorage.getItem(liveKey),
    localStorage.getItem(legacyKey)
  );
  if (resolved.writeLive && resolved.value != null) {
    localStorage.setItem(liveKey, resolved.value);
  }
  if (resolved.dropLegacy) {
    localStorage.removeItem(legacyKey);
  }
  return resolved.value;
}

export function writeSessionDraftItem(
  scope: DraftScope | null,
  value: string
): void {
  dropUnscopedBusinessKeys();
  if (!scope) return;
  localStorage.setItem(sessionDraftLiveKey(scope), value);
  localStorage.removeItem(sessionDraftLegacyKey(scope));
}

export function removeSessionDraftItem(scope: DraftScope | null): void {
  if (!scope) return;
  localStorage.removeItem(sessionDraftLiveKey(scope));
  localStorage.removeItem(sessionDraftLegacyKey(scope));
}

export function draftScopeFromUser(
  user: { teamId: string; accountId: string } | null | undefined
): DraftScope | null {
  if (!user) return null;
  return { teamId: user.teamId, accountId: user.accountId };
}

export function ownerToken(scope: DraftScope): string {
  return `${scope.teamId}:${scope.accountId}`;
}

export function parseOwnerToken(raw: string | null): DraftScope | null {
  if (!raw) return null;
  const sep = raw.indexOf(":");
  if (sep <= 0 || sep === raw.length - 1) return null;
  return { teamId: raw.slice(0, sep), accountId: raw.slice(sep + 1) };
}

/** 无后缀全局草稿不再认领到当前账号，避免串号 */
export function dropUnscopedBusinessKeys(): void {
  for (const key of UNSCOPED_DROP) {
    localStorage.removeItem(key);
  }
}

export function readScopedItem(
  base: string,
  scope: DraftScope | null
): string | null {
  dropUnscopedBusinessKeys();
  if (!scope) return null;
  return localStorage.getItem(scopedKey(base, scope));
}

export function writeScopedItem(
  base: string,
  scope: DraftScope | null,
  value: string
): void {
  dropUnscopedBusinessKeys();
  if (!scope) return;
  localStorage.setItem(scopedKey(base, scope), value);
}

export function removeScopedItem(
  base: string,
  scope: DraftScope | null
): void {
  if (!scope) return;
  localStorage.removeItem(scopedKey(base, scope));
}

export function clearAccountDrafts(scope: DraftScope): void {
  dropUnscopedBusinessKeys();
  for (const base of ACCOUNT_DRAFT_BASES) {
    localStorage.removeItem(scopedKey(base, scope));
  }
  localStorage.removeItem(sessionDraftLiveKey(scope));
}

const AUTH_OWNER_CHANNEL = "softball_auth_owner";

function postAuthOwnerMessage(token: string | null): void {
  try {
    const channel = new BroadcastChannel(AUTH_OWNER_CHANNEL);
    channel.postMessage(token);
    channel.close();
  } catch {
    // 部分浏览器隐私模式不支持 BroadcastChannel
  }
}

/** cookie 为准：写入公开的 teamId:accountId，供其他标签发现身份变更 */
export function writeAuthOwner(scope: DraftScope): void {
  const token = ownerToken(scope);
  if (localStorage.getItem(STORAGE_KEYS.authOwner) === token) return;
  localStorage.setItem(STORAGE_KEYS.authOwner, token);
  postAuthOwnerMessage(token);
}

export function clearAuthOwner(): void {
  if (localStorage.getItem(STORAGE_KEYS.authOwner) == null) return;
  localStorage.removeItem(STORAGE_KEYS.authOwner);
  postAuthOwnerMessage(null);
}

export function syncAuthOwnerWithUser(
  user: { teamId: string; accountId: string } | null
): void {
  if (!user) {
    clearAuthOwner();
    return;
  }
  writeAuthOwner({ teamId: user.teamId, accountId: user.accountId });
}

export function subscribeAuthOwnerChange(onChange: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEYS.authOwner || event.key === null) {
      onChange();
    }
  };
  window.addEventListener("storage", onStorage);
  let channel: BroadcastChannel | null = null;
  try {
    channel = new BroadcastChannel(AUTH_OWNER_CHANNEL);
    channel.onmessage = () => onChange();
  } catch {
    channel = null;
  }
  return () => {
    window.removeEventListener("storage", onStorage);
    channel?.close();
  };
}
