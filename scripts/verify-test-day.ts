/**
 * 测试日纯函数回归：migrate / 归档校验 / 排阵文案 / 比率 / 速度格 / 自定义项。
 * npx tsx scripts/verify-test-day.ts
 */
import {
  migrateGameArchive,
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
  buildAssignmentCommitHeadline,
  formatAssignmentPairs,
} from "../lib/testDay/assignmentLog";
import {
  buildClientArchivePayload,
  sessionArchiveHasContent,
} from "../lib/testDay/archiveValidation";
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

if (failed > 0) {
  console.error(`verify-test-day: ${failed} failed`);
  process.exit(1);
}
console.log("verify-test-day: all passed");
