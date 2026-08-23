import {
  APPEND_ENTRY_KINDS,
  type CollabMergeDecision,
  type CollabStoredConflict,
  type CollabStoredEntry,
  type TestDayEntryKind,
} from "@/lib/testDay/collab/types";

export function isAppendKind(kind: TestDayEntryKind): boolean {
  return APPEND_ENTRY_KINDS.includes(kind);
}

export function normalizeJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeJson);
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const next: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) {
      if (obj[key] === undefined) continue;
      next[key] = normalizeJson(obj[key]);
    }
    return next;
  }
  return value;
}

export function payloadsEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(normalizeJson(a)) === JSON.stringify(normalizeJson(b));
}

/** 同格比较忽略 id/timestamp，只认成绩值 */
export function cellValueFingerprint(
  kind: TestDayEntryKind,
  payload: unknown
): string {
  if (!payload || typeof payload !== "object") {
    return JSON.stringify(normalizeJson(payload));
  }
  const row = payload as Record<string, unknown>;
  switch (kind) {
    case "speed_mark":
      return JSON.stringify({
        playerId: row.playerId,
        columnId: row.columnId,
        seconds: row.seconds,
      });
    case "strike_cell":
      return JSON.stringify({
        columnId: row.columnId,
        judgeId: row.judgeId,
        pitchCall: row.pitchCall,
        swung: row.swung,
      });
    case "throw_play":
      return JSON.stringify({
        testItem: row.testItem,
        throwerId: row.throwerId,
        firstBaseId: row.firstBaseId,
        success: row.success,
        blame: row.blame ?? null,
      });
    case "custom_player_note":
    case "custom_group_note":
    case "custom_single_note":
      return JSON.stringify({
        testItem: row.testItem,
        playerId: row.playerId ?? null,
        memberIds: row.memberIds ?? null,
        note: typeof row.note === "string" ? row.note.trim() : row.note,
      });
    default:
      return JSON.stringify(normalizeJson(payload));
  }
}

export function parseCandidateIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((id): id is string => typeof id === "string" && id.length > 0);
}

export function hasOpenConflict(
  conflicts: CollabStoredConflict[],
  entityKey: string
): boolean {
  return conflicts.some(
    (row) => row.entityKey === entityKey && row.reviewStatus === "open"
  );
}

export function canArchiveDraft(conflicts: CollabStoredConflict[]): boolean {
  return !conflicts.some((row) => row.reviewStatus === "open");
}

// 推导步骤：同 clientEntryId 幂等；追加类直接插入；单格同值复用、异值插入并记冲突
export function decideEntryMerge(input: {
  kind: TestDayEntryKind;
  entityKey: string;
  clientEntryId: string;
  payload: unknown;
  existing: CollabStoredEntry[];
}): CollabMergeDecision {
  const sameClient = input.existing.find(
    (row) => row.clientEntryId === input.clientEntryId
  );
  if (sameClient) return { action: "idempotent", existing: sameClient };

  if (isAppendKind(input.kind)) return { action: "insert" };

  const activeSameKey = input.existing.filter(
    (row) =>
      row.entityKey === input.entityKey &&
      row.status === "active" &&
      row.kind === input.kind
  );
  if (activeSameKey.length === 0) return { action: "insert" };

  const fingerprint = cellValueFingerprint(input.kind, input.payload);
  const sameValue = activeSameKey.find(
    (row) => cellValueFingerprint(row.kind, row.payload) === fingerprint
  );
  if (sameValue) return { action: "reuse_same_value", existing: sameValue };

  return {
    action: "insert_and_conflict",
    existingIds: activeSameKey.map((row) => row.id),
    type: "value_mismatch",
  };
}
