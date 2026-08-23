import { formatDateOnly } from "@/lib/dateOnly";
import { parseCandidateIds } from "@/lib/testDay/collab/merge";
import {
  projectDraftSnapshot,
  toPublicConflicts,
  type DraftBoardSnapshot,
} from "@/lib/testDay/collab/projectSnapshot";
import type {
  CollabStoredConflict,
  CollabStoredEntry,
  PublicConflict,
  TestDayConflictReviewStatus,
  TestDayConflictType,
  TestDayDraftStatus,
  TestDayEntryKind,
  TestDayEntryStatus,
} from "@/lib/testDay/collab/types";

export type TestDayDraftListItem = {
  id: string;
  date: string;
  status: TestDayDraftStatus;
  version: number;
  createdByAccountId: string;
  memberCount: number;
  isMember: boolean;
};

export type TestDayDraftDto = {
  id: string;
  date: string;
  status: TestDayDraftStatus;
  version: number;
  createdByAccountId: string;
  canMutateStructure: boolean;
  isMember: boolean;
  snapshot: DraftBoardSnapshot;
  conflicts: PublicConflict[];
  openConflictCount: number;
};

type DraftRow = {
  id: string;
  date: Date;
  status: TestDayDraftStatus;
  version: number;
  createdByAccountId: string;
  testItems: unknown;
  assignments: unknown;
  customTests: unknown;
  skillStructure: unknown;
  assignmentLog: unknown;
};

type EntryRow = {
  id: string;
  kind: TestDayEntryKind;
  entityKey: string;
  payload: unknown;
  clientEntryId: string;
  authorAccountId: string;
  status: TestDayEntryStatus;
};

type ConflictRow = {
  id: string;
  entityKey: string;
  type: TestDayConflictType;
  candidateEntryIds: unknown;
  reviewStatus: TestDayConflictReviewStatus;
  finalPayload: unknown;
};

export function toStoredEntry(row: EntryRow): CollabStoredEntry {
  return {
    id: row.id,
    kind: row.kind,
    entityKey: row.entityKey,
    payload: row.payload,
    clientEntryId: row.clientEntryId,
    authorAccountId: row.authorAccountId,
    status: row.status,
  };
}

export function toStoredConflict(row: ConflictRow): CollabStoredConflict {
  return {
    id: row.id,
    entityKey: row.entityKey,
    type: row.type,
    candidateEntryIds: parseCandidateIds(row.candidateEntryIds),
    reviewStatus: row.reviewStatus,
    finalPayload: row.finalPayload ?? null,
  };
}

export function buildDraftDto(input: {
  draft: DraftRow;
  entries: EntryRow[];
  conflicts: ConflictRow[];
  accountId: string;
  canMutateStructure: boolean;
  isMember: boolean;
}): TestDayDraftDto {
  const entries = input.entries.map(toStoredEntry);
  const conflicts = input.conflicts.map(toStoredConflict);
  const snapshot = projectDraftSnapshot({
    testItems: input.draft.testItems,
    assignments: input.draft.assignments,
    customTests: input.draft.customTests,
    skillStructure: input.draft.skillStructure,
    assignmentLog: input.draft.assignmentLog,
    entries,
    conflicts,
  });
  const publicConflicts = toPublicConflicts(conflicts, entries);
  return {
    id: input.draft.id,
    date: formatDateOnly(input.draft.date),
    status: input.draft.status,
    version: input.draft.version,
    createdByAccountId: input.draft.createdByAccountId,
    canMutateStructure: input.canMutateStructure,
    isMember: input.isMember,
    snapshot,
    conflicts: publicConflicts,
    openConflictCount: publicConflicts.filter(
      (row) => row.reviewStatus === "open"
    ).length,
  };
}
