// RED-S / 女性运动员健康早期哨兵：规则触发转介提示，禁止自动诊断或禁赛。
// 触发后球员端展示全文；教练端仅见 monitor_health 脱敏标签。

import { asOfDateStrFrom, parseDateOnly } from "@/lib/dateOnly";

export type RedsSignalInput = {
  /** 自报近 3 个月不规律/长期未来潮 */
  selfReportedIrregular: boolean;
  /** 按个人 typicalLength 推算：连续缺失的预期经期次数 */
  missedExpectedPeriods: number;
  /** 近 30 天疲劳均值（0–10），无数据为 null */
  avgFatigue30d: number | null;
  /** 近 30 天睡眠差占比 0–1，无数据为 null */
  badSleepRatio30d: number | null;
  /** 球员主动勾选的敏感项（默认关） */
  bodyImageAnxietyOptIn: boolean;
};

export type RedsEvaluation = {
  triggered: boolean;
  /** 满足的信号条数 */
  hitCount: number;
  reasons: string[];
};

const TRIGGER_THRESHOLD = 2;

// 推导步骤：逐条计分 → ≥2 触发转介（非诊断）
export function evaluateRedsSignals(input: RedsSignalInput): RedsEvaluation {
  const reasons: string[] = [];

  if (input.selfReportedIrregular) {
    reasons.push("自报月经不规律或长期未来潮");
  }
  if (input.missedExpectedPeriods >= 2) {
    reasons.push(
      `按个人周期推算，约连续 ${input.missedExpectedPeriods} 个预期窗口未见经期开始记录`
    );
  }
  if (
    input.avgFatigue30d !== null &&
    input.avgFatigue30d >= 6 &&
    input.badSleepRatio30d !== null &&
    input.badSleepRatio30d >= 0.4
  ) {
    reasons.push("近 30 天疲劳偏高且睡眠差占比较高");
  }
  if (input.bodyImageAnxietyOptIn) {
    reasons.push("已勾选对饮食/体重持续焦虑（自愿敏感项）");
  }

  const hitCount = reasons.length;
  return {
    triggered: hitCount >= TRIGGER_THRESHOLD,
    hitCount,
    reasons,
  };
}

/** 根据末次经期与典型长度，估算「错过」的预期经期次数（粗估哨兵） */
export function estimateMissedExpectedPeriods(
  lastPeriodStart: string | null,
  typicalLengthDays: number,
  today: Date = new Date(),
  asOfDateStr?: string
): number {
  if (!lastPeriodStart || !/^\d{4}-\d{2}-\d{2}$/.test(lastPeriodStart)) {
    return 0;
  }
  const length = Math.max(21, Math.min(40, Math.round(typicalLengthDays)));
  const start = parseDateOnly(lastPeriodStart);
  const todayNoon = parseDateOnly(asOfDateStrFrom(asOfDateStr, today));
  const days = Math.floor(
    (todayNoon.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)
  );
  if (days < length + 7) return 0;
  // 超过 1 个完整周期 + 宽限 7 天后开始计数
  return Math.floor((days - 7) / length);
}
