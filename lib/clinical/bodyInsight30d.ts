import { PAIN_AREA_LABEL, type PainArea } from "@/lib/clinical/painAreas";
import {
  computePainTrendFromSeries,
  type InjuryTrendDirection,
} from "@/lib/clinical/injuryTrend";

export const BODY_INSIGHT_30D_RULE_VERSION = "body_insight_v0.3";
export const BODY_INSIGHT_DISCLAIMER =
  "本报告来自用户主观记录，用于自我观察，不构成医疗诊断。";

export type MetricTrendDirection = "up" | "down" | "flat" | "insufficient";

export type MetricTrend = {
  windowAvg: number | null;
  recentAvg: number | null;
  baselineMedian: number | null;
  delta: number | null;
  direction: MetricTrendDirection;
};

export type BodyInsight30dReport = {
  windowDays: 30;
  periodStart: string;
  periodEnd: string;
  coverage: {
    preDays: number;
    postSessions: number;
    trainingDays: number;
    painLogDays: number;
  };
  recovery: {
    sleep: MetricTrend;
    energy: MetricTrend;
    soreness: MetricTrend;
    stress: MetricTrend;
  };
  training: {
    totalLoad: number;
    sessionCount: number;
    avgDailyLoad: number;
    weeklyLoads: [number, number, number, number];
    recentWeekLoad: number;
    weeklyMedian: number | null;
  };
  pain: {
    maxScore: number | null;
    activeAreaCount: number;
    topAreas: { area: PainArea; label: string; trend: InjuryTrendDirection }[];
  };
  signalFlags: string[];
  narrativeKey: string;
  narrative: string;
  disclaimer: string;
};

export type InsightPreRow = {
  date: string;
  sleep: number;
  fatigue: number;
  soreness: number;
  stress: number;
};

export type InsightPostRow = {
  date: string;
  sessionLoad: number;
};

export type InsightPainRow = {
  date: string;
  painArea: PainArea;
  painScore: number;
};

const WINDOW_DAYS = 30;
const RECENT_DAYS = 7;
const MIN_WINDOW_SAMPLES = 5;
const MIN_RECENT_SAMPLES = 2;
const RECOVERY_DELTA = 0.5;
const PAIN_DELTA = 1;
const LOAD_UP_RATIO = 1.15;
const LOAD_SPIKE_RATIO = 1.3;
const RISK_FLAGS = [
  "sleep_down",
  "energy_down",
  "soreness_down",
  "stress_down",
  "load_up",
  "pain_up",
] as const;

function addCalendarDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function avg(nums: number[]): number | null {
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function median(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

function emptyTrend(windowVals: number[], recentVals: number[]): MetricTrend {
  return {
    windowAvg: avg(windowVals),
    recentAvg: avg(recentVals),
    baselineMedian: median(windowVals),
    delta: null,
    direction: "insufficient",
  };
}

function valuesOnDates(
  records: { date: string; value: number }[],
  dateSet: Set<string>
): number[] {
  const byDate = new Map<string, number[]>();
  for (const r of records) {
    if (!dateSet.has(r.date)) continue;
    const bucket = byDate.get(r.date) ?? [];
    bucket.push(r.value);
    byDate.set(r.date, bucket);
  }
  const out: number[] = [];
  for (const vals of byDate.values()) {
    const dayAvg = avg(vals);
    if (dayAvg != null) out.push(dayAvg);
  }
  return out;
}

function computeBaselineTrend(
  records: { date: string; value: number }[],
  windowDates: Set<string>,
  recentDates: Set<string>,
  higherIsBetter: boolean,
  deltaThreshold: number
): MetricTrend {
  const windowVals = valuesOnDates(records, windowDates);
  const recentVals = valuesOnDates(records, recentDates);
  if (windowVals.length < MIN_WINDOW_SAMPLES || recentVals.length < MIN_RECENT_SAMPLES) {
    return emptyTrend(windowVals, recentVals);
  }
  const windowAvg = avg(windowVals);
  const recentAvg = avg(recentVals);
  const baselineMedian = median(windowVals);
  if (windowAvg == null || recentAvg == null || baselineMedian == null) {
    return emptyTrend(windowVals, recentVals);
  }
  const delta = recentAvg - baselineMedian;
  let direction: MetricTrendDirection = "flat";
  if (higherIsBetter) {
    if (delta <= -deltaThreshold) direction = "down";
    else if (delta >= deltaThreshold) direction = "up";
  } else if (delta >= deltaThreshold) direction = "up";
  else if (delta <= -deltaThreshold) direction = "down";
  return { windowAvg, recentAvg, baselineMedian, delta, direction };
}

function sumLoadInDates(posts: InsightPostRow[], dates: Set<string>): number {
  let sum = 0;
  for (const p of posts) {
    if (dates.has(p.date)) sum += p.sessionLoad;
  }
  return sum;
}

function computeWeeklyLoads(
  posts: InsightPostRow[],
  dates: string[]
): [number, number, number, number] {
  const weeks: [number, number, number, number] = [0, 0, 0, 0];
  for (let w = 0; w < 4; w++) {
    const chunk = dates.slice(w * 7, w * 7 + 7);
    weeks[w] = sumLoadInDates(posts, new Set(chunk));
  }
  return weeks;
}

function dailyMaxPain(rows: InsightPainRow[]): Map<string, number> {
  const byDate = new Map<string, number>();
  for (const e of rows) {
    const prev = byDate.get(e.date);
    if (prev == null || e.painScore > prev) byDate.set(e.date, e.painScore);
  }
  return byDate;
}

function buildNarrative(narrativeKey: string, flags: string[]): string {
  if (narrativeKey === "body.insufficient") {
    return "近 30 天记录尚少，继续记录后可对比你自己的平时状态。";
  }
  if (narrativeKey === "body.overreach") {
    const loadHigh = flags.includes("load_up") || flags.includes("load_spike");
    return loadHigh
      ? "近 7 天恢复相关指标低于你这 30 天的平时，同时训练负荷也偏高。建议安排恢复，并降低高强度课次。"
      : "近 7 天多项恢复相关指标低于你这 30 天的平时。建议安排恢复，并留意训练强度。";
  }
  if (narrativeKey === "body.caution") {
    return "近 7 天出现多项恢复走弱或负荷高于平时的信号。建议主动减量观察几天，避免慢慢透支。";
  }
  if (narrativeKey === "body.pain") {
    return "近 30 天疼痛信号有上升趋势。建议关注局部疼痛变化，必要时调整传杀、打击或跑垒计划。";
  }
  return "近 30 天相对你的平时尚平稳。继续留意睡眠、精力与局部疼痛即可。";
}

export function buildBodyInsight30dReport(params: {
  preList: InsightPreRow[];
  postList: InsightPostRow[];
  painList: InsightPainRow[];
  today?: string;
}): BodyInsight30dReport {
  const today = params.today ?? new Date().toISOString().slice(0, 10);
  const periodEnd = today;
  const periodStart = addCalendarDays(today, -(WINDOW_DAYS - 1));
  const dates: string[] = [];
  for (let i = 0; i < WINDOW_DAYS; i++) {
    dates.push(addCalendarDays(periodStart, i));
  }
  const windowDates = new Set(dates);
  const recentDates = new Set(dates.slice(-RECENT_DAYS));

  const preInWindow = params.preList.filter(
    (p) => p.date >= periodStart && p.date <= periodEnd
  );
  const postInWindow = params.postList.filter(
    (p) => p.date >= periodStart && p.date <= periodEnd
  );
  const painInWindow = params.painList.filter(
    (e) => e.date >= periodStart && e.date <= periodEnd
  );

  const preDays = new Set(preInWindow.map((p) => p.date)).size;
  const trainingDays = new Set(postInWindow.map((p) => p.date)).size;
  const painByDate = dailyMaxPain(painInWindow);
  const painLogDays = painByDate.size;

  const recovery = {
    sleep: computeBaselineTrend(
      preInWindow.map((p) => ({ date: p.date, value: p.sleep })),
      windowDates,
      recentDates,
      true,
      RECOVERY_DELTA
    ),
    energy: computeBaselineTrend(
      preInWindow.map((p) => ({ date: p.date, value: p.fatigue })),
      windowDates,
      recentDates,
      true,
      RECOVERY_DELTA
    ),
    soreness: computeBaselineTrend(
      preInWindow.map((p) => ({ date: p.date, value: p.soreness })),
      windowDates,
      recentDates,
      true,
      RECOVERY_DELTA
    ),
    stress: computeBaselineTrend(
      preInWindow.map((p) => ({ date: p.date, value: p.stress })),
      windowDates,
      recentDates,
      true,
      RECOVERY_DELTA
    ),
  };

  const totalLoad = postInWindow.reduce((s, p) => s + p.sessionLoad, 0);
  const sessionCount = postInWindow.length;
  const avgDailyLoad = trainingDays > 0 ? Math.round(totalLoad / trainingDays) : 0;
  const weeklyLoads = computeWeeklyLoads(postInWindow, dates);
  const recentWeekLoad = sumLoadInDates(postInWindow, recentDates);
  const weeklyMedian = median(weeklyLoads);

  const maxScore = painByDate.size > 0 ? Math.max(...painByDate.values()) : null;
  const areaIds = new Set(painInWindow.map((e) => e.painArea));
  const topAreas: BodyInsight30dReport["pain"]["topAreas"] = [];
  for (const area of areaIds) {
    const byDate = new Map<string, number>();
    for (const e of painInWindow) {
      if (e.painArea !== area) continue;
      const prev = byDate.get(e.date);
      if (prev == null || e.painScore > prev) byDate.set(e.date, e.painScore);
    }
    const series = [...byDate.entries()]
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([date, score]) => ({ date, score }));
    topAreas.push({
      area,
      label: PAIN_AREA_LABEL[area],
      trend: computePainTrendFromSeries(series),
    });
  }
  topAreas.sort((a, b) => {
    const order = { rising: 0, stable: 1, falling: 2, insufficient: 3 };
    return order[a.trend] - order[b.trend];
  });

  const weeksWithLoad = weeklyLoads.filter((w) => w > 0).length;
  const canCompareLoad =
    weeksWithLoad >= 2 && weeklyMedian != null && weeklyMedian > 0;
  const canCompareRecovery = (
    ["sleep", "energy", "soreness", "stress"] as const
  ).some((k) => recovery[k].direction !== "insufficient");
  const canComparePain =
    painLogDays >= 3 || topAreas.some((a) => a.trend !== "insufficient");
  const insufficientData =
    (preDays < 5 && sessionCount < 3 && painLogDays < 3) ||
    (!canCompareRecovery && !canCompareLoad && !canComparePain);

  const flags: string[] = [];
  if (!insufficientData) {
    if (recovery.sleep.direction === "down") flags.push("sleep_down");
    if (recovery.energy.direction === "down") flags.push("energy_down");
    if (recovery.soreness.direction === "down") flags.push("soreness_down");
    if (recovery.stress.direction === "down") flags.push("stress_down");
    if (canCompareLoad && weeklyMedian != null) {
      if (recentWeekLoad > weeklyMedian * LOAD_UP_RATIO) flags.push("load_up");
      if (recentWeekLoad > weeklyMedian * LOAD_SPIKE_RATIO) {
        flags.push("load_spike");
      }
    }
    const painRecords = [...painByDate.entries()].map(([date, value]) => ({
      date,
      value,
    }));
    const painTrend = computeBaselineTrend(
      painRecords,
      windowDates,
      recentDates,
      false,
      PAIN_DELTA
    );
    if (topAreas.some((a) => a.trend === "rising") || painTrend.direction === "up") {
      flags.push("pain_up");
    }
  }

  let narrativeKey = "body.ok";
  if (insufficientData) narrativeKey = "body.insufficient";
  else {
    const riskCount = RISK_FLAGS.filter((f) => flags.includes(f)).length;
    if (riskCount >= 3) narrativeKey = "body.overreach";
    else if (riskCount >= 2) narrativeKey = "body.caution";
    else if (flags.includes("pain_up")) narrativeKey = "body.pain";
  }

  return {
    windowDays: 30,
    periodStart,
    periodEnd,
    coverage: { preDays, postSessions: sessionCount, trainingDays, painLogDays },
    recovery,
    training: {
      totalLoad,
      sessionCount,
      avgDailyLoad,
      weeklyLoads,
      recentWeekLoad,
      weeklyMedian,
    },
    pain: { maxScore, activeAreaCount: areaIds.size, topAreas },
    signalFlags: flags,
    narrativeKey,
    narrative: `${buildNarrative(narrativeKey, flags)}（规则 ${BODY_INSIGHT_30D_RULE_VERSION}）`,
    disclaimer: BODY_INSIGHT_DISCLAIMER,
  };
}
