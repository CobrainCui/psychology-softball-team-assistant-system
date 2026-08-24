/**
 * 协作测试日纯函数：entityKey、同值去重、异值冲突、幂等 clientEntryId、open conflict 拒归档、
 * 删除请求裁决、作者撤回、分组备注修订。
 * npm run verify:test-day-collab
 */
import {
  flyEntityKey,
  hitEntityKey,
  speedEntityKey,
  strikeEntityKey,
  throwEntityKey,
  customNoteEntityKey,
} from "../lib/testDay/collab/entityKeys";
import {
  assertConflictPickEntryId,
  canArchiveDraft,
  conflictAfterAuthorWithdraw,
  decideEntryMerge,
  resolveDeleteRequestDecision,
} from "../lib/testDay/collab/merge";
import { projectDraftSnapshot } from "../lib/testDay/collab/projectSnapshot";
import { buildGuestDraftDto } from "../lib/testDay/collab/dto";
import { validateEntryPayload } from "../lib/testDay/collab/validatePayload";
import type { CollabStoredEntry } from "../lib/testDay/collab/types";
import { createDefaultSpeedColumns } from "../lib/testDay/speedGrid";
import { pickLatestUnsyncedFeedbackDraftId } from "../lib/sessionFeedback";
import {
  ARCHIVE_SELF_FAILED_ERROR,
  ARCHIVE_SELF_PENDING_ERROR,
  ARCHIVE_INFLIGHT_ERROR,
  ARCHIVE_OPEN_CONFLICT_ERROR,
  archiveDevicesReady,
  canConfirmArchiveReady,
  isDeviceArchiveReady,
  parseDeviceId,
} from "../lib/testDay/collab/archiveReady";
import {
  endConfirmTestDayDraft,
  tryBeginConfirmTestDayDraft,
} from "../lib/testDay/collab/confirmGate";

let failed = 0;

function assert(cond: boolean, msg: string) {
  if (cond) {
    console.log("PASS", msg);
    return;
  }
  failed += 1;
  console.error("FAIL", msg);
}

assert(hitEntityKey("h1") === "hit:h1", "hit entityKey");
assert(flyEntityKey("f1") === "fly:f1", "fly entityKey");
assert(speedEntityKey("p1", "firstBase") === "speed:p1:firstBase", "speed entityKey");
assert(strikeEntityKey("c1", "j1") === "strike:c1:j1", "strike entityKey");
assert(
  throwEntityKey("6-3传球", "p1", "p2") === "throw:6-3传球:p1:p2",
  "throw entityKey"
);
assert(customNoteEntityKey("折返", "p1") === "cnote:折返:p1", "custom note entityKey");

const hitPayload = {
  id: "h1",
  result: "LD" as const,
  playerId: "p1",
  playerName: "张三",
  timestamp: 1,
  x: 10,
  y: 20,
};

const hitParsed = validateEntryPayload("hit", hitPayload);
assert(hitParsed.ok && hitParsed.clientEntryId === "h1", "validate hit payload");

const existingHit: CollabStoredEntry = {
  id: "db1",
  kind: "hit",
  entityKey: "hit:h1",
  payload: hitPayload,
  clientEntryId: "h1",
  authorAccountId: "a1",
  status: "active",
};

const idempotent = decideEntryMerge({
  kind: "hit",
  entityKey: "hit:h1",
  clientEntryId: "h1",
  payload: hitPayload,
  existing: [existingHit],
});
assert(idempotent.action === "idempotent", "same clientEntryId is idempotent");

const unionHit = decideEntryMerge({
  kind: "hit",
  entityKey: "hit:h2",
  clientEntryId: "h2",
  payload: { ...hitPayload, id: "h2" },
  existing: [existingHit],
});
assert(unionHit.action === "insert", "different hit UUID is union insert");

const speedA: CollabStoredEntry = {
  id: "s1",
  kind: "speed_mark",
  entityKey: "speed:p1:firstBase",
  payload: {
    id: "s1",
    playerId: "p1",
    playerName: "张三",
    columnId: "firstBase",
    seconds: 4.2,
    timestamp: 1,
  },
  clientEntryId: "s1",
  authorAccountId: "a1",
  status: "active",
};

const sameSpeed = decideEntryMerge({
  kind: "speed_mark",
  entityKey: "speed:p1:firstBase",
  clientEntryId: "s2",
  payload: {
    id: "s2",
    playerId: "p1",
    playerName: "张三",
    columnId: "firstBase",
    seconds: 4.2,
    timestamp: 9,
  },
  existing: [speedA],
});
assert(sameSpeed.action === "reuse_same_value", "same speed cell value is reused");

const mismatchSpeed = decideEntryMerge({
  kind: "speed_mark",
  entityKey: "speed:p1:firstBase",
  clientEntryId: "s3",
  payload: {
    id: "s3",
    playerId: "p1",
    playerName: "李四",
    columnId: "firstBase",
    seconds: 4.8,
    timestamp: 9,
  },
  existing: [speedA],
});
assert(
  mismatchSpeed.action === "insert_and_conflict",
  "different speed cell value creates conflict"
);

assert(
  canArchiveDraft([{
    id: "c1",
    entityKey: "speed:p1:firstBase",
    type: "value_mismatch",
    candidateEntryIds: ["s1", "s3"],
    reviewStatus: "open",
    finalPayload: null,
  }]) === false,
  "open conflict blocks archive"
);

assert(
  canArchiveDraft([{
    id: "c1",
    entityKey: "speed:p1:firstBase",
    type: "value_mismatch",
    candidateEntryIds: ["s1", "s3"],
    reviewStatus: "resolved",
    finalPayload: speedA.payload,
  }]) === true,
  "resolved conflict allows archive"
);

const conflictedSnap = projectDraftSnapshot({
  testItems: ["T座打击"],
  assignments: {},
  customTests: { customTestDefs: [] },
  skillStructure: { speedColumns: createDefaultSpeedColumns(), strikeJudgeColumns: [] },
  assignmentLog: [],
  entries: [
    speedA,
    {
      id: "s3",
      kind: "speed_mark",
      entityKey: "speed:p1:firstBase",
      payload: {
        id: "s3",
        playerId: "p1",
        playerName: "李四",
        columnId: "firstBase",
        seconds: 4.8,
        timestamp: 9,
      },
      clientEntryId: "s3",
      authorAccountId: "a2",
      status: "active",
    },
  ],
  conflicts: [{
    id: "c1",
    entityKey: "speed:p1:firstBase",
    type: "value_mismatch",
    candidateEntryIds: ["s1", "s3"],
    reviewStatus: "open",
    finalPayload: null,
  }],
});
assert(
  conflictedSnap.speedMarks.length === 0,
  "open conflict omits the cell from projection"
);

const resolvedSnap = projectDraftSnapshot({
  testItems: ["T座打击"],
  assignments: {},
  customTests: { customTestDefs: [] },
  skillStructure: { speedColumns: createDefaultSpeedColumns(), strikeJudgeColumns: [] },
  assignmentLog: [],
  entries: [speedA],
  conflicts: [{
    id: "c1",
    entityKey: "speed:p1:firstBase",
    type: "value_mismatch",
    candidateEntryIds: ["s1", "s3"],
    reviewStatus: "resolved",
    finalPayload: speedA.payload,
  }],
});
assert(
  resolvedSnap.speedMarks.length === 1 &&
    resolvedSnap.speedMarks[0]?.seconds === 4.2,
  "resolved conflict projects finalPayload"
);

const deleteReqSnap = projectDraftSnapshot({
  testItems: ["T座打击"],
  assignments: {},
  customTests: { customTestDefs: [] },
  skillStructure: { speedColumns: createDefaultSpeedColumns(), strikeJudgeColumns: [] },
  assignmentLog: [],
  entries: [speedA],
  conflicts: [{
    id: "d1",
    entityKey: "speed:p1:firstBase",
    type: "delete_request",
    candidateEntryIds: ["s1"],
    reviewStatus: "open",
    finalPayload: null,
  }],
});
assert(
  deleteReqSnap.speedMarks.length === 1 &&
    deleteReqSnap.speedMarks[0]?.seconds === 4.2,
  "open delete_request still projects cell"
);
assert(
  canArchiveDraft([{
    id: "d1",
    entityKey: "speed:p1:firstBase",
    type: "delete_request",
    candidateEntryIds: ["s1"],
    reviewStatus: "open",
    finalPayload: null,
  }], [speedA]) === false,
  "open delete_request still blocks archive"
);

assert(
  resolveDeleteRequestDecision("approve_delete") === "approve_delete",
  "delete_request approve_delete"
);
assert(
  resolveDeleteRequestDecision("reject_delete") === "reject_delete",
  "delete_request reject_delete"
);
assert(
  resolveDeleteRequestDecision("pick") === "invalid",
  "delete_request rejects pick"
);

assert(
  conflictAfterAuthorWithdraw({
    type: "delete_request",
    reviewStatus: "open",
    candidateEntryIds: ["e1"],
    withdrawnEntryId: "e1",
  }).action === "resolve_as_withdrawn",
  "author withdraw last delete_request candidate resolves"
);
assert(
  conflictAfterAuthorWithdraw({
    type: "value_mismatch",
    reviewStatus: "open",
    candidateEntryIds: ["e1", "e2"],
    withdrawnEntryId: "e1",
  }).action === "dismiss",
  "author withdraw leaving one mismatch candidate dismisses"
);
assert(
  conflictAfterAuthorWithdraw({
    type: "value_mismatch",
    reviewStatus: "open",
    candidateEntryIds: ["e1", "e2", "e3"],
    withdrawnEntryId: "e1",
  }).action === "update_candidates",
  "author withdraw leaving two mismatch candidates updates list"
);

const groupFirst = {
  id: "g1",
  revisionId: "r1",
  testItem: "折返",
  memberIds: ["p1", "p2"],
  memberNames: ["张三", "李四"],
  note: "第一版",
  timestamp: 1,
};
const groupParsed = validateEntryPayload("custom_group_note", groupFirst);
assert(
  groupParsed.ok &&
    groupParsed.clientEntryId === "r1" &&
    groupParsed.entityKey === "cnote:折返:group:g1",
  "group note revisionId is clientEntryId, id stays in entityKey"
);

const legacyGroup = {
  id: "g2",
  testItem: "折返",
  memberIds: ["p1", "p2"],
  memberNames: ["张三", "李四"],
  note: "旧版",
  timestamp: 1,
};
const legacyParsed = validateEntryPayload("custom_group_note", legacyGroup);
assert(
  legacyParsed.ok && legacyParsed.clientEntryId === "g2",
  "legacy group note uses id as clientEntryId"
);

const tombstonedGroup: CollabStoredEntry = {
  id: "ge1",
  kind: "custom_group_note",
  entityKey: "cnote:折返:group:g1",
  payload: groupFirst,
  clientEntryId: "r1",
  authorAccountId: "a1",
  status: "tombstoned",
};
const replayTombstone = decideEntryMerge({
  kind: "custom_group_note",
  entityKey: "cnote:折返:group:g1",
  clientEntryId: "r1",
  payload: groupFirst,
  existing: [tombstonedGroup],
});
assert(
  replayTombstone.action !== "idempotent",
  "tombstoned clientEntryId is not idempotent"
);

const groupSecond = {
  ...groupFirst,
  revisionId: "r2",
  note: "第二版",
  timestamp: 2,
};
const groupSecondParsed = validateEntryPayload("custom_group_note", groupSecond);
assert(groupSecondParsed.ok, "second group note revision validates");
const secondMerge = decideEntryMerge({
  kind: "custom_group_note",
  entityKey: groupSecondParsed.ok ? groupSecondParsed.entityKey : "",
  clientEntryId: groupSecondParsed.ok ? groupSecondParsed.clientEntryId : "",
  payload: groupSecond,
  existing: [tombstonedGroup],
});
assert(secondMerge.action === "insert", "group note second revision inserts");

const twoEditSnap = projectDraftSnapshot({
  testItems: ["折返"],
  assignments: {},
  customTests: { customTestDefs: [{ name: "折返", mode: "per_group" }] },
  skillStructure: {
    speedColumns: createDefaultSpeedColumns(),
    strikeJudgeColumns: [],
  },
  assignmentLog: [],
  entries: [
    tombstonedGroup,
    {
      id: "ge2",
      kind: "custom_group_note",
      entityKey: "cnote:折返:group:g1",
      payload: groupSecond,
      clientEntryId: "r2",
      authorAccountId: "a1",
      status: "active",
    },
  ],
  conflicts: [],
});
assert(
  twoEditSnap.customGroupNotes.length === 1 &&
    twoEditSnap.customGroupNotes[0]?.note === "第二版" &&
    twoEditSnap.customGroupNotes[0]?.id === "g1" &&
    canArchiveDraft([]) === true,
  "two group-note edits keep latest note and can archive"
);

const mismatchB: CollabStoredEntry = {
  id: "s3",
  kind: "speed_mark",
  entityKey: "speed:p1:firstBase",
  payload: {
    id: "s3",
    playerId: "p1",
    playerName: "李四",
    columnId: "firstBase",
    seconds: 4.8,
    timestamp: 9,
  },
  clientEntryId: "s3",
  authorAccountId: "a2",
  status: "active",
};
const dismissedMismatch = [
  {
    id: "c1",
    entityKey: "speed:p1:firstBase",
    type: "value_mismatch" as const,
    candidateEntryIds: ["s1", "s3"],
    reviewStatus: "dismissed" as const,
    finalPayload: null,
  },
];
assert(
  canArchiveDraft(dismissedMismatch, [speedA, mismatchB]) === false,
  "dismissed mismatch without final value still blocks archive"
);
assert(
  canArchiveDraft(
    [{
      ...dismissedMismatch[0],
      reviewStatus: "resolved",
      finalPayload: speedA.payload,
    }],
    [speedA, mismatchB]
  ) === true,
  "resolved mismatch with finalPayload allows archive"
);
assert(
  assertConflictPickEntryId(["s1", "s3"], "s9").ok === false,
  "pick rejects entryId outside candidates"
);
assert(
  assertConflictPickEntryId(["s1", "s3"], "s1").ok === true,
  "pick accepts candidate entryId"
);

const guestDto = buildGuestDraftDto({
  draft: {
    id: "guest-draft",
    date: new Date("2026-08-23T04:00:00.000Z"),
    status: "open",
    version: 1,
    createdByAccountId: "acc-creator",
  },
});
assert(
  guestDto.isMember === false &&
    guestDto.snapshot.testItems.length === 0 &&
    guestDto.snapshot.hits.length === 0 &&
    guestDto.conflicts.length === 0 &&
    guestDto.deviceGates.length === 0 &&
    guestDto.allDevicesArchiveReady === false &&
    guestDto.selfDeviceReady === false &&
    !JSON.stringify(guestDto).includes("密项"),
  "guest DTO snapshot is empty"
);

assert(
  archiveDevicesReady({ members: [], devices: [] }) === false,
  "empty member list is not archive-ready"
);
assert(
  archiveDevicesReady({
    members: [{ accountId: "a1" }],
    devices: [
      {
        accountId: "a1",
        archiveReadyAt: new Date(),
        pendingOutboxCount: 0,
        failedOutboxCount: 0,
      },
    ],
  }) === true,
  "single confirmed device is archive-ready"
);
assert(
  archiveDevicesReady({
    members: [{ accountId: "a1" }, { accountId: "a2" }],
    devices: [
      {
        accountId: "a1",
        archiveReadyAt: new Date(),
        pendingOutboxCount: 0,
        failedOutboxCount: 0,
      },
    ],
  }) === false,
  "member without device blocks archive-ready"
);
assert(
  archiveDevicesReady({
    members: [{ accountId: "a1" }],
    devices: [
      {
        accountId: "a1",
        archiveReadyAt: new Date(),
        pendingOutboxCount: 0,
        failedOutboxCount: 0,
      },
      {
        accountId: "a1",
        archiveReadyAt: null,
        pendingOutboxCount: 0,
        failedOutboxCount: 0,
      },
    ],
  }) === false,
  "unconfirmed second device blocks archive-ready"
);
assert(
  isDeviceArchiveReady({
    accountId: "a1",
    archiveReadyAt: new Date(),
    pendingOutboxCount: 1,
    failedOutboxCount: 0,
  }) === false,
  "ready timestamp with pending outbox is not archive-ready"
);
assert(
  parseDeviceId("short") === null &&
    parseDeviceId("device-01") === "device-01",
  "deviceId length and charset"
);
const pendingBlock = canConfirmArchiveReady({
  pendingCount: 1,
  failedCount: 0,
});
assert(
  !pendingBlock.ok && pendingBlock.error === ARCHIVE_SELF_PENDING_ERROR,
  "pending blocks local confirm"
);
const failedBlock = canConfirmArchiveReady({
  pendingCount: 0,
  failedCount: 1,
});
assert(
  !failedBlock.ok && failedBlock.error === ARCHIVE_SELF_FAILED_ERROR,
  "failed items block local confirm"
);
assert(
  canConfirmArchiveReady({ pendingCount: 0, failedCount: 0 }).ok === true &&
    ARCHIVE_SELF_PENDING_ERROR.length > 0,
  "zero pending and failed can confirm"
);
const inflightBlock = canConfirmArchiveReady({
  pendingCount: 0,
  failedCount: 0,
  inflightCount: 1,
});
assert(
  !inflightBlock.ok && inflightBlock.error === ARCHIVE_INFLIGHT_ERROR,
  "inflight submit blocks local confirm"
);
const openConflictBlock = canConfirmArchiveReady({
  pendingCount: 0,
  failedCount: 0,
  openConflictCount: 1,
});
assert(
  !openConflictBlock.ok &&
    openConflictBlock.error === ARCHIVE_OPEN_CONFLICT_ERROR,
  "open conflict blocks local confirm"
);
const confirmGateId = `confirm-gate-${Date.now()}`;
assert(
  tryBeginConfirmTestDayDraft(confirmGateId) === true,
  "confirm gate accepts first holder"
);
assert(
  tryBeginConfirmTestDayDraft(confirmGateId) === false,
  "confirm gate rejects concurrent holder"
);
endConfirmTestDayDraft(confirmGateId);
assert(
  tryBeginConfirmTestDayDraft(confirmGateId) === true,
  "confirm gate releases after end"
);
endConfirmTestDayDraft(confirmGateId);
assert(
  pickLatestUnsyncedFeedbackDraftId(
    [
      {
        id: "old",
        playerId: "p1",
        date: "2026-08-23",
        timestamp: 1,
      },
      {
        id: "new",
        playerId: "p1",
        date: "2026-08-23",
        timestamp: 2,
      },
    ],
    "p1",
    "2026-08-23"
  ) === "new",
  "latest unsynced feedback draft is the newest timestamp"
);

if (failed > 0) {
  console.error(`verify-test-day-collab failed: ${failed}`);
  process.exit(1);
}
console.log("verify-test-day-collab ok");
