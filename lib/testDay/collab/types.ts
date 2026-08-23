export const TEST_DAY_DRAFT_STATUSES = [
  "open",
  "frozen",
  "archived",
] as const;
export type TestDayDraftStatus = (typeof TEST_DAY_DRAFT_STATUSES)[number];

export const TEST_DAY_ENTRY_KINDS = [
  "hit",
  "fly_catch",
  "speed_mark",
  "strike_cell",
  "throw_play",
  "custom_player_note",
  "custom_group_note",
  "custom_single_note",
] as const;
export type TestDayEntryKind = (typeof TEST_DAY_ENTRY_KINDS)[number];

export const APPEND_ENTRY_KINDS: readonly TestDayEntryKind[] = [
  "hit",
  "fly_catch",
];

export const TEST_DAY_ENTRY_STATUSES = ["active", "tombstoned"] as const;
export type TestDayEntryStatus = (typeof TEST_DAY_ENTRY_STATUSES)[number];

export const TEST_DAY_CONFLICT_TYPES = [
  "value_mismatch",
  "structure",
  "delete_request",
] as const;
export type TestDayConflictType = (typeof TEST_DAY_CONFLICT_TYPES)[number];

export const TEST_DAY_CONFLICT_REVIEW_STATUSES = [
  "open",
  "resolved",
  "dismissed",
] as const;
export type TestDayConflictReviewStatus =
  (typeof TEST_DAY_CONFLICT_REVIEW_STATUSES)[number];

export type CollabStoredEntry = {
  id: string;
  kind: TestDayEntryKind;
  entityKey: string;
  payload: unknown;
  clientEntryId: string;
  authorAccountId: string;
  status: TestDayEntryStatus;
};

export type CollabStoredConflict = {
  id: string;
  entityKey: string;
  type: TestDayConflictType;
  candidateEntryIds: string[];
  reviewStatus: TestDayConflictReviewStatus;
  finalPayload: unknown | null;
};

export type CollabMergeDecision =
  | { action: "idempotent"; existing: CollabStoredEntry }
  | { action: "reuse_same_value"; existing: CollabStoredEntry }
  | { action: "insert" }
  | {
      action: "insert_and_conflict";
      existingIds: string[];
      type: TestDayConflictType;
    };

export type PublicConflictCandidate = {
  id: string;
  authorAccountId: string;
  payload: unknown;
};

export type PublicConflict = {
  id: string;
  entityKey: string;
  type: TestDayConflictType;
  reviewStatus: TestDayConflictReviewStatus;
  candidateEntryIds: string[];
  candidates: PublicConflictCandidate[];
  finalPayload: unknown | null;
};
