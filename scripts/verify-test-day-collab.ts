/**
 * 协作测试日纯函数：entityKey、同值去重、异值冲突、幂等 clientEntryId、open conflict 拒归档。
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
  canArchiveDraft,
  decideEntryMerge,
} from "../lib/testDay/collab/merge";
import { projectDraftSnapshot } from "../lib/testDay/collab/projectSnapshot";
import { validateEntryPayload } from "../lib/testDay/collab/validatePayload";
import type { CollabStoredEntry } from "../lib/testDay/collab/types";
import { createDefaultSpeedColumns } from "../lib/testDay/speedGrid";

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

if (failed > 0) {
  console.error(`verify-test-day-collab failed: ${failed}`);
  process.exit(1);
}
console.log("verify-test-day-collab ok");
