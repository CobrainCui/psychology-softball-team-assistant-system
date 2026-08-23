/**
 * 测试日纯函数回归：migrate / 归档校验 / 排阵文案 / 比率 / 速度格 / 自定义项。
 * npx tsx scripts/verify-test-day.ts
 */
import {
  migrateGameArchive,
  GAME_ARCHIVE_SCHEMA_VERSION,
  type GameArchive,
  type HitRecord,
} from "../lib/gameArchive";
import { sessionToGameArchive } from "../lib/sessionMapper";
import {
  createEmptySessionDraft,
  sessionDraftIsEmpty,
} from "../lib/sessionDraft";
import {
  LIVE_DRAFT_SLOT,
  resolveLiveDraftMigration,
  scopedKey,
  sessionDraftLegacyKey,
  sessionDraftLiveKey,
} from "../lib/scopedStorage";
import { STORAGE_KEYS } from "../lib/storageKeys";
import {
  isPermanentSyncReject,
  testDayEntryDedupeKey,
  testDayTombstoneDedupeKey,
} from "../lib/syncOutbox";
import { overlayPendingOnSnapshot } from "../lib/testDay/collab/pendingOverlay";
import { emptyDraftBoardSnapshot } from "../lib/testDay/collab/projectSnapshot";
import { addCalendarDays } from "../lib/dateOnly";
import { isWithinTestDayArchiveWindow } from "../lib/season/timeZone";
import {
  buildAssignmentCommitHeadline,
  formatAssignmentPairs,
} from "../lib/testDay/assignmentLog";
import {
  buildClientArchivePayload,
  sessionArchiveHasContent,
} from "../lib/testDay/archiveValidation";
import { buildTestSessionCreateInput } from "../lib/testDay/sessionArchiveWrite";
import {
  ensureCustomTestDefs,
  pruneCustomTestSlice,
} from "../lib/testDay/customTests";
import {
  firstBaseGetsCredit,
  isStrikeJudgeCorrect,
  throwerGetsCredit,
} from "../lib/testDay/skillRates";
import {
  parseSpeedSeconds,
  resolveSpeedGrid,
} from "../lib/testDay/speedGrid";
import {
  archivePlayerLineCount,
  buildArchivePlayerReviews,
} from "../lib/testDay/archivePlayerReview";

let failed = 0;

function assert(cond: boolean, msg: string) {
  if (cond) {
    console.log("PASS", msg);
    return;
  }
  failed += 1;
  console.error("FAIL", msg);
}

const sampleHit: HitRecord = {
  id: "h1",
  result: "LD",
  playerId: "p1",
  playerName: "张三",
  timestamp: 1,
};

assert(
  migrateGameArchive({ gameId: 1, date: "2026-08-21", data: [sampleHit] })
    ?.hits[0]?.id === "h1",
  "migrateGameArchive 把旧 data 归一到 hits"
);

assert(
  migrateGameArchive({ foo: 1 }) === null,
  "migrateGameArchive 拒绝缺 gameId/date 的对象"
);

assert(
  formatAssignmentPairs(
    [
      { playerId: "p1", testItem: "接高飞" },
      { playerId: "p1", testItem: "好球判断" },
      { playerId: "p2", testItem: "6-3传球" },
    ],
    [
      { id: "p1", name: "张三" },
      { id: "p2", name: "李四" },
    ]
  ) === "张三→接高飞、好球判断；李四→6-3传球",
  "formatAssignmentPairs 按人合并项目"
);

assert(
  buildAssignmentCommitHeadline("王五", false) === "王五进行了一次测试报名",
  "首次报名标题"
);
assert(
  buildAssignmentCommitHeadline("王五", true) === "王五进行了一次测试报名修改",
  "修改报名标题"
);

assert(
  sessionArchiveHasContent({ hits: [], speedRecords: [] }) === false,
  "空盘面不可归档"
);
assert(
  sessionArchiveHasContent({ hits: [sampleHit], speedRecords: [] }) === true,
  "有打点可归档"
);

const payload = buildClientArchivePayload({
  hits: [
    sampleHit,
    { ...sampleHit, id: "bad", result: "HR" } as unknown as HitRecord,
  ],
  speedColumns: [],
  speedMarks: [
    {
      id: "m1",
      playerId: "p1",
      playerName: "张三",
      columnId: "firstBase",
      seconds: 3.2,
      timestamp: 1,
    },
  ],
  flyCatchAttempts: [],
  strikeJudgeColumns: [],
  strikeJudgeCells: [],
  throwPlays: [],
  assignments: {},
  testItems: [],
  assignmentLog: [],
});
assert(payload.hits.length === 1 && payload.hits[0].id === "h1", "归档过滤非法打击结果");
assert(payload.speedRecords.length === 1, "秒数格派生 speedRecords");

assert(isStrikeJudgeCorrect("strike", true) === true, "好球挥棒为判断正确");
assert(isStrikeJudgeCorrect("strike", false) === false, "好球不挥为判断错误");
assert(throwerGetsCredit(false, "firstBase") === true, "一垒独责时传球手计成功");
assert(firstBaseGetsCredit(false, "thrower") === true, "传球独责时一垒手计成功");
assert(throwerGetsCredit(false, "both") === false, "双方有责传球手计失败");

assert(parseSpeedSeconds("") === null, "空秒数不当成 0");
assert(parseSpeedSeconds("3.20") === 3.2, "解析有效秒数");
assert(
  resolveSpeedGrid([], [], []).columns.map((c) => c.id).join(",") ===
    "firstBase,secondBase",
  "空格补默认上一垒/上二垒"
);

const defs = ensureCustomTestDefs(
  ["T座打击", "折返跑"],
  [],
  ["T座打击", "上垒速度"]
);
assert(
  defs.length === 1 && defs[0].name === "折返跑" && defs[0].mode === "per_player",
  "自定义项缺定义时默认每人备注"
);
assert(
  pruneCustomTestSlice(
    {
      customTestDefs: defs,
      customPlayerNotes: [
        {
          id: "n1",
          testItem: "折返跑",
          playerId: "p1",
          playerName: "张三",
          note: "ok",
          timestamp: 1,
        },
      ],
      customGroupNotes: [],
      customSingleNotes: [],
    },
    "折返跑"
  ).customPlayerNotes.length === 0,
  "删除自定义项时清掉对应备注"
);

const scope = { teamId: "team1", accountId: "acc1" };
assert(
  sessionDraftLiveKey(scope) ===
    `${STORAGE_KEYS.sessionDraft}:team1:acc1:${LIVE_DRAFT_SLOT}`,
  "当场草稿键带 :live 槽"
);
assert(
  sessionDraftLegacyKey(scope) === `${STORAGE_KEYS.sessionDraft}:team1:acc1`,
  "旧两段键不含 live"
);
assert(
  scopedKey(STORAGE_KEYS.gamesHistory, scope) ===
    `${STORAGE_KEYS.gamesHistory}:team1:acc1`,
  "其它草稿仍用两段分区键"
);
assert(
  scopedKey(STORAGE_KEYS.syncOutbox, scope) ===
    `${STORAGE_KEYS.syncOutbox}:team1:acc1`,
  "待同步队列按账号分区"
);
assert(
  testDayEntryDedupeKey("d1", "c1") === "entry:d1:c1" &&
    testDayTombstoneDedupeKey("d1", "c1") === "tombstone:d1:c1",
  "测试日队列去重键含 draftId 与 clientEntryId"
);
assert(
  isPermanentSyncReject("草稿已归档，不能继续提交") === true &&
    isPermanentSyncReject("仅可修改或删除当日记录") === true &&
    isPermanentSyncReject("本机已确认同步，不能再录入。请先取消确认。") ===
      true &&
    isPermanentSyncReject("Failed to fetch") === false,
  "永久拒绝不进重试，网络错误可重试"
);
assert(
  addCalendarDays("2026-08-23", -1) === "2026-08-22" &&
    addCalendarDays("2026-01-01", -1) === "2025-12-31",
  "日历日加减不经过本地时区"
);
assert(
  isWithinTestDayArchiveWindow(
    "2026-08-22",
    "Asia/Shanghai",
    new Date("2026-08-23T04:00:00.000Z")
  ) &&
    !isWithinTestDayArchiveWindow(
      "2026-08-21",
      "Asia/Shanghai",
      new Date("2026-08-23T04:00:00.000Z")
    ),
  "测试日可次日补归档，更早日期拒绝"
);

const pendingHit = overlayPendingOnSnapshot(
  emptyDraftBoardSnapshot(),
  [
    {
      schemaVersion: 2,
      id: "q1",
      kind: "test_day_entry",
      status: "pending",
      dedupeKey: "entry:d1:h-pending",
      createdAt: 1,
      attempts: 0,
      payload: {
        draftId: "d1",
        kind: "hit",
        payload: {
          id: "h-pending",
          result: "LD",
          playerId: "p1",
          playerName: "甲",
          timestamp: 1,
        },
      },
    },
    {
      schemaVersion: 2,
      id: "q2",
      kind: "test_day_entry",
      status: "failed",
      dedupeKey: "entry:d1:h-failed",
      createdAt: 2,
      attempts: 1,
      payload: {
        draftId: "d1",
        kind: "hit",
        payload: {
          id: "h-failed",
          result: "FB",
          playerId: "p1",
          playerName: "甲",
          timestamp: 2,
        },
      },
      failedReason: "草稿已归档，不能继续提交",
    },
  ],
  "d1"
);
assert(
  pendingHit.snapshot.hits.length === 1 &&
    pendingHit.snapshot.hits[0]?.id === "h-pending" &&
    pendingHit.pendingIds.includes("h-pending") &&
    !pendingHit.pendingIds.includes("h-failed"),
  "待同步 Entry 投影到盘面，失败匣不投影"
);

const promote = resolveLiveDraftMigration(null, '{"hits":[]}');
assert(
  promote.writeLive === true &&
    promote.dropLegacy === true &&
    promote.value === '{"hits":[]}',
  "旧两段键升到 :live"
);
const keepLive = resolveLiveDraftMigration('{"live":1}', '{"old":1}');
assert(
  keepLive.writeLive === false &&
    keepLive.dropLegacy === true &&
    keepLive.value === '{"live":1}',
  "已有 live 时丢弃旧键不认领"
);
const emptyMig = resolveLiveDraftMigration(null, null);
assert(
  emptyMig.value === null &&
    emptyMig.writeLive === false &&
    emptyMig.dropLegacy === false,
  "无草稿不写盘"
);

assert(
  sessionDraftIsEmpty(createEmptySessionDraft()) === true,
  "空盘面不落草稿"
);
assert(
  sessionDraftIsEmpty({
    ...createEmptySessionDraft(),
    currentBatterId: "p1",
  }) === true,
  "仅默认打击者不单独落草稿"
);

const v4 = migrateGameArchive({
  schemaVersion: 4,
  gameId: 1,
  date: "2026-08-21",
  data: [sampleHit],
});
assert(
  v4 !== null &&
    v4.hits[0]?.id === "h1" &&
    Object.keys(v4.assignments).length === 0 &&
    v4.testItems.length === 0 &&
    v4.assignmentLog.length === 0,
  "旧 v4 快照 migrate 后排阵三项为空安全值"
);

const archivedAt = new Date("2026-08-23T04:00:00.000Z");
const mapped = sessionToGameArchive({
  schemaVersion: 5,
  archivedAt,
  assignments: { p1: ["T座打击", "接高飞"] },
  testItems: ["T座打击", "上垒速度", "接高飞"],
  assignmentLog: [
    {
      id: "log1",
      author: "队长",
      summary: "队长进行了一次测试报名",
      added: [{ playerId: "p1", testItem: "接高飞" }],
      removed: [],
      timestamp: 1,
    },
  ],
  customTests: null,
  hits: [
    {
      id: "h1",
      playerId: "p1",
      result: "LD",
      x: null,
      y: null,
      pitchType: null,
      hitQuality: null,
      recordedAt: archivedAt,
      player: { id: "p1", name: "张三" },
    },
  ],
  speedRecords: [],
  speedColumns: [],
  speedMarks: [],
  flyCatchAttempts: [],
  strikeJudgeColumns: [],
  strikeJudgeCells: [],
  throwPlays: [],
});
assert(
  mapped.assignments.p1?.join(",") === "T座打击,接高飞" &&
    mapped.testItems.includes("接高飞") &&
    mapped.testItems.includes("投手") &&
    mapped.assignmentLog[0]?.id === "log1",
  "sessionToGameArchive 读回排阵与修改记录"
);

const roundTrip = migrateGameArchive(mapped);
assert(
  roundTrip !== null &&
    roundTrip.assignments.p1?.includes("接高飞") === true &&
    roundTrip.assignmentLog[0]?.author === "队长",
  "归档 mapper → migrate 排阵字段仍在"
);

const reviewArchive: GameArchive = {
  schemaVersion: GAME_ARCHIVE_SCHEMA_VERSION,
  gameId: 1,
  date: "2026-08-23",
  hits: [
    {
      id: "h1",
      result: "LD",
      playerId: "p1",
      playerName: "甲",
      timestamp: 1,
    },
  ],
  speedRecords: [],
  speedColumns: [{ id: "firstBase", name: "上一垒", sortOrder: 0 }],
  speedMarks: [
    {
      id: "s1",
      playerId: "p1",
      playerName: "甲",
      columnId: "firstBase",
      seconds: 4.2,
      timestamp: 1,
    },
  ],
  flyCatchAttempts: [],
  strikeJudgeColumns: [],
  strikeJudgeCells: [],
  throwPlays: [],
  customTestDefs: [],
  customPlayerNotes: [],
  customGroupNotes: [],
  customSingleNotes: [],
  assignments: { p1: ["T座打击"], p2: ["接高飞"] },
  testItems: ["T座打击", "接高飞"],
  assignmentLog: [],
};
const reviews = buildArchivePlayerReviews(reviewArchive, {
  p1: "甲",
  p2: "乙",
});
const playerA = reviews.find((row) => row.playerId === "p1");
const playerB = reviews.find((row) => row.playerId === "p2");
assert(reviews.length === 2, "archive review includes assigned players");
assert(
  playerA?.hits.length === 1 &&
    playerA.speedMarks[0]?.columnName === "上一垒" &&
    playerA.speedMarks[0]?.seconds === 4.2,
  "archive review groups hits and speed cells by player"
);
assert(
  playerB !== undefined && archivePlayerLineCount(playerB) === 0,
  "assigned player without scores still listed"
);

const persistSpeedA = buildTestSessionCreateInput(
  buildClientArchivePayload({
    hits: [],
    speedColumns: [{ id: "firstBase", name: "上一垒", sortOrder: 0 }],
    speedMarks: [
      {
        id: "m1",
        playerId: "p1",
        playerName: "甲",
        columnId: "firstBase",
        seconds: 3.9,
        timestamp: 1,
      },
    ],
    flyCatchAttempts: [],
    strikeJudgeColumns: [],
    strikeJudgeCells: [],
    throwPlays: [],
    assignments: {},
    testItems: [],
    assignmentLog: [],
    customTestDefs: [],
    customPlayerNotes: [],
    customGroupNotes: [],
    customSingleNotes: [],
  }),
  "team-a",
  archivedAt
);
const persistSpeedB = buildTestSessionCreateInput(
  buildClientArchivePayload({
    hits: [],
    speedColumns: [{ id: "firstBase", name: "上一垒", sortOrder: 0 }],
    speedMarks: [
      {
        id: "m2",
        playerId: "p2",
        playerName: "乙",
        columnId: "firstBase",
        seconds: 4.0,
        timestamp: 1,
      },
    ],
    flyCatchAttempts: [],
    strikeJudgeColumns: [],
    strikeJudgeCells: [],
    throwPlays: [],
    assignments: {},
    testItems: [],
    assignmentLog: [],
    customTestDefs: [],
    customPlayerNotes: [],
    customGroupNotes: [],
    customSingleNotes: [],
  }),
  "team-b",
  archivedAt
);
function asCreateRows(
  value: unknown
): Array<{ id?: string; boardColumnId?: string; columnId?: string }> {
  if (Array.isArray(value)) {
    return value as Array<{
      id?: string;
      boardColumnId?: string;
      columnId?: string;
    }>;
  }
  if (value && typeof value === "object") {
    return [
      value as {
        id?: string;
        boardColumnId?: string;
        columnId?: string;
      },
    ];
  }
  return [];
}

const speedColA = asCreateRows(persistSpeedA.speedColumns?.create)[0];
const speedColB = asCreateRows(persistSpeedB.speedColumns?.create)[0];
const speedMarkA = asCreateRows(persistSpeedA.speedMarks?.create)[0];
assert(
  speedColA?.boardColumnId === "firstBase" &&
    speedColB?.boardColumnId === "firstBase" &&
    typeof speedColA?.id === "string" &&
    speedColA.id !== "firstBase" &&
    speedColA.id !== speedColB?.id &&
    speedMarkA?.columnId === speedColA.id,
  "跑垒落库主键按场次另发，盘面 firstBase 不进全局 id"
);

const remappedSpeed = sessionToGameArchive({
  schemaVersion: 5,
  archivedAt,
  assignments: {},
  testItems: [],
  assignmentLog: [],
  customTests: null,
  hits: [],
  speedRecords: [],
  speedColumns: [
    {
      id: "persist-col-1",
      boardColumnId: "firstBase",
      name: "上一垒",
      sortOrder: 0,
    },
  ],
  speedMarks: [
    {
      id: "persist-mark-1",
      columnId: "persist-col-1",
      playerId: "p1",
      seconds: 3.9,
      recordedAt: archivedAt,
      player: { id: "p1", name: "甲" },
    },
  ],
  flyCatchAttempts: [],
  strikeJudgeColumns: [],
  strikeJudgeCells: [],
  throwPlays: [],
});
assert(
  remappedSpeed.speedColumns[0]?.id === "firstBase" &&
    remappedSpeed.speedMarks[0]?.columnId === "firstBase",
  "读回归档把落库主键还原为盘面 firstBase"
);

const lateUtc = new Date("2026-08-23T16:00:00.000Z");
const tzBody = {
  schemaVersion: 5,
  archivedAt: lateUtc,
  assignments: {},
  testItems: [],
  assignmentLog: [],
  customTests: null,
  hits: [],
  speedRecords: [],
  speedColumns: [],
  speedMarks: [],
  flyCatchAttempts: [],
  strikeJudgeColumns: [],
  strikeJudgeCells: [],
  throwPlays: [],
};
assert(
  sessionToGameArchive(tzBody, "Asia/Shanghai").date === "2026-08-24",
  "上海时区 16:00Z 归档日为次日"
);
assert(
  sessionToGameArchive(tzBody, "America/Los_Angeles").date === "2026-08-23",
  "洛杉矶时区 16:00Z 归档日仍为当日"
);
assert(
  sessionToGameArchive(tzBody).date === "2026-08-24",
  "未传时区时默认上海自然日"
);

if (failed > 0) {
  console.error(`verify-test-day: ${failed} failed`);
  process.exit(1);
}
console.log("verify-test-day: all passed");
