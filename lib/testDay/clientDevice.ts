import { STORAGE_KEYS } from "@/lib/storageKeys";
import {
  readScopedItem,
  writeScopedItem,
  type DraftScope,
} from "@/lib/scopedStorage";

export function getClientDeviceId(scope: DraftScope | null): string | null {
  if (!scope || typeof window === "undefined") return null;
  const existing = readScopedItem(STORAGE_KEYS.deviceId, scope);
  if (existing && existing.length >= 8) return existing;
  const next = crypto.randomUUID();
  writeScopedItem(STORAGE_KEYS.deviceId, scope, next);
  return next;
}
