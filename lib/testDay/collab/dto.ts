import { formatDateOnly } from "@/lib/dateOnly";
import {
  archiveDevicesReady,
  isDeviceArchiveReady,
} from "@/lib/testDay/collab/archiveReady";
import { parseCandidateIds } from "@/lib/testDay/collab/merge";
import {
  emptyDraftBoardSnapshot,
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

export type TestDayDeviceGate = {
  deviceId: string;
  accountId: string;
  label: string;
  archiveReady: boolean;
  isSelf: boolean;
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
  archivedSessionId: string | null;
  deviceGates: TestDayDeviceGate[];
  allDevicesArchiveReady: boolean;
  selfDeviceReady: boolean;
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

type MemberRow = {
  accountId: string;
};

export type DeviceGateRow = {
  deviceId: string;
  accountId: string;
  archiveReadyAt: Date | null;
  pendingOutboxCount: number;
  failedOutboxCount: number;
  account: { username: string };
};

export function toDeviceGates(
  devices: DeviceGateRow[],
  viewerDeviceId: string | null
): TestDayDeviceGate[] {
  return devices.map((row) => ({
    deviceId: row.deviceId,
    accountId: row.accountId,
    label: `${row.account.username} · ${row.deviceId.slice(-4)}`,
    archiveReady: isDeviceArchiveReady(row),
    isSelf: Boolean(viewerDeviceId) && row.deviceId === viewerDeviceId,
  }));
}

export function buildArchiveGateFields(input: {
  members: MemberRow[];
  devices: DeviceGateRow[];
  viewerDeviceId: string | null;
}): {
  deviceGates: TestDayDeviceGate[];
  allDevicesArchiveReady: boolean;
  selfDeviceReady: boolean;
} {
  const deviceGates = toDeviceGates(input.devices, input.viewerDeviceId);
  return {
    deviceGates,
    allDevicesArchiveReady: archiveDevicesReady({
      members: input.members,
      devices: input.devices,
    }),
    selfDeviceReady: deviceGates.some(
      (row) => row.isSelf && row.archiveReady
    ),
  };
}

export function buildDraftDto(input: {
  draft: DraftRow;
  entries: EntryRow[];
  conflicts: ConflictRow[];
  accountId: string;
  canMutateStructure: boolean;
  isMember: boolean;
  archivedSessionId?: string | null;
  members?: MemberRow[];
  devices?: DeviceGateRow[];
  viewerDeviceId?: string | null;
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
  const gates = buildArchiveGateFields({
    members: input.members ?? [],
    devices: input.devices ?? [],
    viewerDeviceId: input.viewerDeviceId ?? null,
  });
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
    archivedSessionId: input.archivedSessionId ?? null,
    ...gates,
  };
}

/** 未加入成员只看到场次元数据，不含成绩/排阵/冲突 */
export function buildGuestDraftDto(input: {
  draft: Pick<
    DraftRow,
    "id" | "date" | "status" | "version" | "createdByAccountId"
  >;
  archivedSessionId?: string | null;
}): TestDayDraftDto {
  return {
    id: input.draft.id,
    date: formatDateOnly(input.draft.date),
    status: input.draft.status,
    version: input.draft.version,
    createdByAccountId: input.draft.createdByAccountId,
    canMutateStructure: false,
    isMember: false,
    snapshot: emptyDraftBoardSnapshot(),
    conflicts: [],
    openConflictCount: 0,
    archivedSessionId: input.archivedSessionId ?? null,
    deviceGates: [],
    allDevicesArchiveReady: false,
    selfDeviceReady: false,
  };
}
