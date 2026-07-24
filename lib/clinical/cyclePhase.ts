// 标准 28 天周期阶段推算：以「上次经期开始日」为第 1 天。
// assessment / 其它模块共用，禁止再复制一份分期边界。

export interface CyclePhase {
  label: string;
  dayOfCycle: number;
  isMenstrual: boolean;
  isFollicular: boolean;
  isOvulation: boolean;
  /** 黄体期整体（含经前窗口 24–28） */
  isLuteal: boolean;
  /** 黄体晚期 / 经前（24–28），韧带与主观疲劳风险更高 */
  isLateLuteal: boolean;
}

// 推导步骤：日期差 → 对 28 取模得 dayOfCycle(1–28) → 映射四阶段
export function getCyclePhase(
  startDateStr: string,
  today: Date = new Date()
): CyclePhase {
  const startDate = new Date(startDateStr);
  const oneDayMs = 1000 * 60 * 60 * 24;
  const diffDays = Math.floor(
    (today.getTime() - startDate.getTime()) / oneDayMs
  );
  const dayOfCycle = (((diffDays % 28) + 28) % 28) + 1;

  if (dayOfCycle <= 5) {
    return {
      label: "经期",
      dayOfCycle,
      isMenstrual: true,
      isFollicular: false,
      isOvulation: false,
      isLuteal: false,
      isLateLuteal: false,
    };
  }
  if (dayOfCycle <= 13) {
    return {
      label: "卵泡期",
      dayOfCycle,
      isMenstrual: false,
      isFollicular: true,
      isOvulation: false,
      isLuteal: false,
      isLateLuteal: false,
    };
  }
  if (dayOfCycle <= 16) {
    return {
      label: "排卵期",
      dayOfCycle,
      isMenstrual: false,
      isFollicular: false,
      isOvulation: true,
      isLuteal: false,
      isLateLuteal: false,
    };
  }
  if (dayOfCycle <= 23) {
    return {
      label: "黄体期",
      dayOfCycle,
      isMenstrual: false,
      isFollicular: false,
      isOvulation: false,
      isLuteal: true,
      isLateLuteal: false,
    };
  }
  return {
    label: "黄体晚期 (经前)",
    dayOfCycle,
    isMenstrual: false,
    isFollicular: false,
    isOvulation: false,
    isLuteal: true,
    isLateLuteal: true,
  };
}

// 女性专属负荷折算：排卵期韧带松弛 + 黄体期代谢负荷，仅在疲劳偏高时额外扣分
export function getFemaleCyclePenalty(
  phase: CyclePhase,
  fatigueScore: number
): number {
  let penalty = 0;
  if (phase.isOvulation && fatigueScore >= 6) penalty += 15;
  if (phase.isLuteal && fatigueScore >= 6) penalty += 10;
  return penalty;
}
