import {
  APPEND_ENTRY_KINDS,
  type CollabMergeDecision,
  type CollabStoredConflict,
  type CollabStoredEntry,
  type TestDayConflictDecision,
  type TestDayConflictReviewStatus,
  type TestDayConflictType,
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

/** 仅异值冲突挡住单格投影；delete_request 待裁决时成绩仍显示 */
export function hasOpenValueMismatch(
  conflicts: CollabStoredConflict[],
  entityKey: string
): boolean {
  return conflicts.some(
    (row) =>
      row.entityKey === entityKey &&
      row.reviewStatus === "open" &&
      row.type === "value_mismatch"
  );
}

/** 推导步骤：同格多条 active 且指纹不同，又没有 resolved+finalPayload 时，投影会丢格 */
export function hasAmbiguousActiveCells(
  entries: CollabStoredEntry[],
  conflicts: CollabStoredConflict[]
): boolean {
  const groups = new Map<string, CollabStoredEntry[]>();
  for (const row of entries) {
    if (row.status !== "active" || isAppendKind(row.kind)) continue;
    const key = `${row.kind}\0${row.entityKey}`;
    const list = groups.get(key);
    if (list) list.push(row);
    else groups.set(key, [row]);
  }
  for (const group of groups.values()) {
    const entityKey = group[0].entityKey;
    const kind = group[0].kind;
    const resolved = conflicts.find(
      (row) =>
        row.entityKey === entityKey &&
        row.reviewStatus === "resolved" &&
        row.finalPayload != null
    );
    if (resolved) continue;
    const prints = new Set(
      group.map((row) => cellValueFingerprint(kind, row.payload))
    );
    if (prints.size > 1) return true;
  }
  return false;
}

export function canArchiveDraft(
  conflicts: CollabStoredConflict[],
  entries: CollabStoredEntry[] = []
): boolean {
  if (conflicts.some((row) => row.reviewStatus === "open")) return false;
  return !hasAmbiguousActiveCells(entries, conflicts);
}

export function assertConflictPickEntryId(
  candidateIds: string[],
  entryId: string | undefined
): { ok: true; entryId: string } | { ok: false; error: string } {
  if (!entryId) return { ok: false, error: "请选择一条候选" };
  if (!candidateIds.includes(entryId)) {
    return { ok: false, error: "所选记录不是该冲突的候选" };
  }
  return { ok: true, entryId };
}

export type DeleteRequestResolution =
  | "approve_delete"
  | "reject_delete"
  | "invalid";

/** 删除请求只能批准墓碑或驳回保留，禁止套用“采用候选” */
export function resolveDeleteRequestDecision(
  decision: TestDayConflictDecision
): DeleteRequestResolution {
  if (decision === "approve_delete") return "approve_delete";
  if (decision === "reject_delete") return "reject_delete";
  return "invalid";
}

export type AuthorWithdrawConflictAction =
  | { action: "leave" }
  | { action: "resolve_as_withdrawn" }
  | { action: "dismiss" }
  | { action: "update_candidates"; candidateIds: string[] };

// 推导步骤：作者撤回后从候选去掉该 entry；删除请求无剩余则视为已撤回；异值不足两条则不再构成冲突
export function conflictAfterAuthorWithdraw(input: {
  type: TestDayConflictType;
  reviewStatus: TestDayConflictReviewStatus;
  candidateEntryIds: string[];
  withdrawnEntryId: string;
}): AuthorWithdrawConflictAction {
  if (input.reviewStatus !== "open") return { action: "leave" };
  if (!input.candidateEntryIds.includes(input.withdrawnEntryId)) {
    return { action: "leave" };
  }
  const remaining = input.candidateEntryIds.filter(
    (id) => id !== input.withdrawnEntryId
  );
  if (input.type === "delete_request") {
    return remaining.length === 0
      ? { action: "resolve_as_withdrawn" }
      : { action: "update_candidates", candidateIds: remaining };
  }
  if (input.type === "value_mismatch") {
    if (remaining.length < 2) return { action: "dismiss" };
    return { action: "update_candidates", candidateIds: remaining };
  }
  return remaining.length === 0
    ? { action: "dismiss" }
    : { action: "update_candidates", candidateIds: remaining };
}

// 推导步骤：仅 active 的同 clientEntryId 幂等；墓碑后必须换新 id；追加类直接插入；单格同值复用、异值插入并记冲突
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
  if (sameClient?.status === "active") {
    return { action: "idempotent", existing: sameClient };
  }

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
