// 个人化周期阶段推算：以「上次经期开始日」为第 1 天。
// 黄体期约 14 天倒推排卵窗；assessment / 其它模块共用，禁止再复制分期边界。

export type CycleConfidence = "low" | "medium" | "high";

export type CyclePhaseCode =
  | "menstrual"
  | "follicular"
  | "ovulation"
  | "luteal"
  | "late_luteal";

export interface CyclePhase {
  label: string;
  code: CyclePhaseCode;
  dayOfCycle: number;
  cycleLengthDays: number;
  confidence: CycleConfidence;
  /** 激素避孕/高波动时隐藏硬阶段名，仅保留通用负荷提示 */
  hidePhaseLabels: boolean;
  isMenstrual: boolean;
  isFollicular: boolean;
  isOvulation: boolean;
  /** 黄体期整体（含经前窗口） */
  isLuteal: boolean;
  /** 黄体晚期 / 经前，韧带与主观疲劳风险更高 */
  isLateLuteal: boolean;
}

export interface CyclePhaseOptions {
  cycleLengthDays?: number;
  confidence?: CycleConfidence;
  /** 激素避孕或高波动：降级为症状驱动 */
  hidePhaseLabels?: boolean;
}

const PHASE_LABEL: Record<CyclePhaseCode, string> = {
  menstrual: "经期",
  follicular: "卵泡期",
  ovulation: "排卵期",
  luteal: "黄体期",
  late_luteal: "黄体晚期 (经前)",
};

function clampLength(n: number): number {
  return Math.max(21, Math.min(40, Math.round(n)));
}

function flagsFor(code: CyclePhaseCode) {
  return {
    isMenstrual: code === "menstrual",
    isFollicular: code === "follicular",
    isOvulation: code === "ovulation",
    isLuteal: code === "luteal" || code === "late_luteal",
    isLateLuteal: code === "late_luteal",
  };
}

/** 可变周期长度下的阶段映射：经期 1–5；排卵≈ length−14 ±1；末 5 天为晚黄体 */
export function mapDayToPhaseCode(
  dayOfCycle: number,
  cycleLengthDays: number
): CyclePhaseCode {
  const length = clampLength(cycleLengthDays);
  const day = ((dayOfCycle - 1 + length) % length) + 1;
  const ovulationDay = Math.max(10, length - 14);
  const ovStart = Math.max(6, ovulationDay - 1);
  const ovEnd = Math.min(length, ovulationDay + 1);
  const lateLutealStart = Math.max(ovEnd + 1, length - 4);

  if (day <= 5) return "menstrual";
  if (day < ovStart) return "follicular";
  if (day <= ovEnd) return "ovulation";
  if (day >= lateLutealStart) return "late_luteal";
  return "luteal";
}

// 推导步骤：日期差 → 对个人周期长度取模 → 映射阶段（可隐藏硬标签）
export function getCyclePhase(
  startDateStr: string,
  today: Date = new Date(),
  options: CyclePhaseOptions = {}
): CyclePhase {
  const cycleLengthDays = clampLength(options.cycleLengthDays ?? 28);
  const confidence = options.confidence ?? "low";
  const hidePhaseLabels = Boolean(options.hidePhaseLabels);

  const startDate = new Date(`${startDateStr}T12:00:00.000Z`);
  const todayNoon = new Date(
    Date.UTC(today.getFullYear(), today.getMonth(), today.getDate(), 12)
  );
  const oneDayMs = 1000 * 60 * 60 * 24;
  const diffDays = Math.floor(
    (todayNoon.getTime() - startDate.getTime()) / oneDayMs
  );
  const dayOfCycle =
    ((((diffDays % cycleLengthDays) + cycleLengthDays) % cycleLengthDays) +
      1);

  const code = mapDayToPhaseCode(dayOfCycle, cycleLengthDays);
  const label = hidePhaseLabels
    ? "生理负荷（阶段置信度低）"
    : PHASE_LABEL[code];

  return {
    label,
    code,
    dayOfCycle,
    cycleLengthDays,
    confidence,
    hidePhaseLabels,
    ...flagsFor(code),
  };
}

export type CyclePenaltyOptions = {
  crampsScore?: number;
  /** 低置信且隐藏阶段时，仅症状驱动扣分 */
  symptomOnly?: boolean;
};

// 女性专属负荷折算：优先症状；有可靠阶段时叠加周期窗口（满垒球语境）
export function getFemaleCyclePenalty(
  phase: CyclePhase | null,
  fatigueScore: number,
  options: CyclePenaltyOptions = {}
): number {
  const cramps = options.crampsScore ?? 0;
  let penalty = 0;

  if (options.symptomOnly || !phase || phase.hidePhaseLabels) {
    if (cramps >= 6) penalty += 10;
    else if (cramps >= 4 && fatigueScore >= 6) penalty += 5;
    return penalty;
  }

  if (phase.isMenstrual) {
    if (cramps >= 6) penalty += 15;
    else if (cramps >= 4 || fatigueScore >= 6) penalty += 10;
  }
  if (phase.isOvulation && fatigueScore >= 6) penalty += 15;
  if (phase.isLuteal && fatigueScore >= 6) penalty += 10;
  return penalty;
}
