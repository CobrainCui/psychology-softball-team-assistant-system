// 个人化周期长度：中位数 + 异常间隔剔除（规则引擎，非 ML）。
// 间隔相对中位数偏离 >7 天不计入典型长度，避免高强度训练延误污染模型。

import type { CycleConfidence } from "@/lib/clinical/cyclePhase";

const DEFAULT_CYCLE_LENGTH = 28;
const MIN_CYCLE_LENGTH = 21;
const MAX_CYCLE_LENGTH = 40;
const OUTLIER_DAY_DELTA = 7;

export type CycleLengthResolution = {
  typicalLengthDays: number;
  confidence: CycleConfidence;
  highVariance: boolean;
  intervalCount: number;
};

function clampLength(n: number): number {
  return Math.max(MIN_CYCLE_LENGTH, Math.min(MAX_CYCLE_LENGTH, Math.round(n)));
}

function median(nums: number[]): number {
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1]! + sorted[mid]!) / 2;
  }
  return sorted[mid]!;
}

function parseYmd(dateStr: string): number {
  return new Date(`${dateStr}T12:00:00.000Z`).getTime();
}

/** 相邻经期开始日间隔（天），要求 YYYY-MM-DD 升序或任意顺序均可 */
export function computePeriodIntervals(periodStartDates: string[]): number[] {
  const unique = [...new Set(periodStartDates.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)))];
  unique.sort();
  const intervals: number[] = [];
  for (let i = 1; i < unique.length; i++) {
    const days = Math.round(
      (parseYmd(unique[i]!) - parseYmd(unique[i - 1]!)) / (1000 * 60 * 60 * 24)
    );
    if (days > 0) intervals.push(days);
  }
  return intervals;
}

// 推导步骤：全间隔中位数 → 剔除偏离>7天的 outlier → 再中位数 → 置信度
export function resolveCycleLength(
  periodStartDates: string[]
): CycleLengthResolution {
  const intervals = computePeriodIntervals(periodStartDates);
  if (intervals.length === 0) {
    return {
      typicalLengthDays: DEFAULT_CYCLE_LENGTH,
      confidence: "low",
      highVariance: false,
      intervalCount: 0,
    };
  }

  const rawMedian = median(intervals);
  const kept = intervals.filter(
    (d) => Math.abs(d - rawMedian) <= OUTLIER_DAY_DELTA
  );
  const cleaned = kept.length > 0 ? kept : intervals;
  const typicalLengthDays = clampLength(median(cleaned));

  const spread =
    cleaned.length >= 2
      ? Math.max(...cleaned) - Math.min(...cleaned)
      : 0;
  const highVariance = spread > OUTLIER_DAY_DELTA;

  let confidence: CycleConfidence = "low";
  if (cleaned.length >= 3 && !highVariance) confidence = "high";
  else if (cleaned.length >= 2 && !highVariance) confidence = "medium";
  else if (cleaned.length >= 3) confidence = "medium";

  return {
    typicalLengthDays,
    confidence,
    highVariance,
    intervalCount: cleaned.length,
  };
}

export { DEFAULT_CYCLE_LENGTH, MIN_CYCLE_LENGTH, MAX_CYCLE_LENGTH };
