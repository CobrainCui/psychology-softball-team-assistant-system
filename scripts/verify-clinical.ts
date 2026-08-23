/**
 * 临床规则引擎回归：四象限 / 周期长度 / 训后活动类型。
 * npx tsx scripts/verify-clinical.ts
 */
import {
  ACTIVITY_TYPE_OPTIONS,
  FATIGUE_SCALE_TICKS,
  formatActivityLabels,
  normalizeActivityTypes,
  parseActivityTypes,
} from "../lib/clinical/activityTypes";
import {
  resolveCycleLength,
  computePeriodIntervals,
} from "../lib/clinical/cycleStats";
import {
  buildPreFeedback,
  resolveQuadrant,
} from "../lib/clinical/preQuadrant";
import type { Scale5 } from "../lib/clinical/preDimensions";

let failed = 0;

function assert(cond: boolean, msg: string) {
  if (cond) {
    console.log("PASS", msg);
    return;
  }
  failed += 1;
  console.error("FAIL", msg);
}

const mid: Scale5 = 3;

assert(resolveQuadrant(3, 2) === "slack", "X=3 Y=2 → slack");
assert(resolveQuadrant(2.9, 2) === "real_fatigue", "X<3 Y=2 → real_fatigue");
assert(resolveQuadrant(2.9, 3) === "injury_risk", "X<3 Y=3 → injury_risk");
assert(resolveQuadrant(3, 3) === "peak", "X=3 Y=3 → peak");

const peak = buildPreFeedback({
  input: {
    sleep: 5,
    stress: 5,
    fatigue: 5,
    soreness: 5,
    willingness: 5,
  },
});
assert(peak.quadrant === "peak", "全 5 → peak");
assert(peak.physicalBattery === 5, "全 5 电量 = 5");
assert(!peak.narrative.includes("风车"), "叙事不含风车");

const period = buildPreFeedback({
  input: {
    sleep: mid,
    stress: mid,
    fatigue: mid,
    soreness: mid,
    willingness: 1,
  },
  inMenstrualPeriod: true,
});
assert(period.quadrant === "slack", "经期低意愿 → slack");
assert(period.narrative.includes("经期"), "经期叙事替换");

assert(
  JSON.stringify(computePeriodIntervals(["2026-01-01", "2026-01-29"])) ===
    JSON.stringify([28]),
  "相邻经期间隔 28 天"
);

const cycle = resolveCycleLength([
  "2026-01-01",
  "2026-01-29",
  "2026-02-26",
  "2026-05-01",
]);
assert(cycle.typicalLengthDays === 28, "剔除 outlier 后典型长度 28");
assert(cycle.intervalCount === 2, "outlier 间隔不计入 cleaned");

assert(
  ACTIVITY_TYPE_OPTIONS.some((o) => o.value === "throwing_defense" && o.label === "防守"),
  "传杀防守已改为防守"
);
assert(
  !ACTIVITY_TYPE_OPTIONS.some((o) => o.label === "其他"),
  "预设不含其他"
);
assert(
  formatActivityLabels(["batting", "throwing_defense"]) === "打击、防守",
  "多选活动标签拼接"
);
assert(
  formatActivityLabels([]) === "未分类",
  "空活动类型显示未分类"
);
const mapped = normalizeActivityTypes(["打击", "传杀防守"]);
assert(
  mapped.success &&
    mapped.types[0] === "batting" &&
    mapped.types[1] === "throwing_defense",
  "中文标签收成预设 code"
);
const emptyTypes = normalizeActivityTypes([]);
assert(!emptyTypes.success, "活动类型至少一项");
const customTooLong = normalizeActivityTypes(["x".repeat(17)]);
assert(!customTooLong.success, "自定义活动最长 16 字");
assert(
  parseActivityTypes(["other", "batting"]).join(",") === "batting",
  "旧 other 读取时丢弃"
);
assert(
  formatActivityLabels(["batting", "力量"]) === "打击、力量",
  "自定义活动原文上屏"
);
assert(
  FATIGUE_SCALE_TICKS.length === 10 &&
    FATIGUE_SCALE_TICKS.every((t) => t.label.length > 0),
  "疲劳 1–10 均有文案"
);

if (failed > 0) {
  console.error(`verify-clinical: ${failed} failed`);
  process.exit(1);
}
console.log("verify-clinical: all passed");
