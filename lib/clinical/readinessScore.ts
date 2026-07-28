// 体能准备度计分：Hooper 风格四维 → 0–100 + 五档负荷带（队内启发式，非临床量表）。
// 禁止混入局部伤病熔断；伤病走 Availability。

import type { SleepQuality } from "@/lib/readinessHistory";

export type LoadBandId =
  | "full_100"
  | "full_85"
  | "modified_70"
  | "modified_50"
  | "rest_energy";

export type LoadBand = {
  id: LoadBandId;
  label: string;
  loadPercent: number;
  /** 满垒球专项清单 */
  focus: string[];
  redLine: string;
};

export type ReadinessDimensionBreakdown = {
  sleepHooper: number;
  stressHooper: number;
  fatigueHooper: number;
  sorenessHooper: number;
  hooperSum: number;
  cyclePenalty: number;
  baselineAdjustment: number;
  readinessScore: number;
  loadBand: LoadBand;
};

const LOAD_BANDS: LoadBand[] = [
  {
    id: "full_100",
    label: "满负荷",
    loadPercent: 100,
    focus: [
      "外野高飞球落点判断与启动",
      "实战发力打击 / 技术密集操练",
      "下肢爆发力与髋驱动力量（仍监控落地膝位）",
    ],
    redLine: "仍禁止带明显关节刺痛硬刚；传杀/下抛出现控球变差立即减量。",
  },
  {
    id: "full_85",
    label: "可训·控峰值",
    loadPercent: 85,
    focus: [
      "技术定型与中高强度对抗",
      "力量维持，避免单次极限新高",
      "跑垒变向先质量后强度",
    ],
    redLine: "禁止连续大力传杀堆量与失控急停变向比赛。",
  },
  {
    id: "modified_70",
    label: "技术为主·约 70%",
    loadPercent: 70,
    focus: [
      "击球点固定姿势挥击（控制发力）",
      "落地与变向质量练习（膝盖与第二脚趾同向）",
      "低强度传接与防守脚步",
    ],
    redLine: "避免堆传杀与连续大力下抛；缩短高强度区间。",
  },
  {
    id: "modified_50",
    label: "明显减量·约 50%",
    loadPercent: 50,
    focus: [
      "轻量动力链激活与技术慢动作",
      "缩短对抗与跑动总量",
      "优先恢复与睡眠",
    ],
    redLine: "禁止极限冲刺、大重量深蹲新高与疲劳下硬传。",
  },
  {
    id: "rest_energy",
    label: "恢复课·体能性休息",
    loadPercent: 30,
    focus: [
      "散步级有氧或动态伸展",
      "轻量核心抗旋转（无痛范围）",
      "今日不以专项表现为目标",
    ],
    redLine: "建议取消对抗与测试日关键项；若局部剧痛请转「运动损伤」模块。",
  },
];

// 推导步骤：0–10 线性映射到 Hooper 1–7（不良分越高越差）
export function map0to10ToHooper(score: number): number {
  const clamped = Math.max(0, Math.min(10, score));
  return Math.round(1 + (clamped / 10) * 6);
}

export function mapSleepToHooper(sleep: SleepQuality): number {
  if (sleep === "good") return 1;
  if (sleep === "normal") return 3;
  return 6;
}

export function loadBandFromScore(score: number): LoadBand {
  if (score >= 90) return LOAD_BANDS[0]!;
  if (score >= 75) return LOAD_BANDS[1]!;
  if (score >= 60) return LOAD_BANDS[2]!;
  if (score >= 45) return LOAD_BANDS[3]!;
  return LOAD_BANDS[4]!;
}

function bandIndex(id: LoadBandId): number {
  return LOAD_BANDS.findIndex((b) => b.id === id);
}

function shiftBandDown(band: LoadBand, steps: number): LoadBand {
  const idx = Math.min(LOAD_BANDS.length - 1, bandIndex(band.id) + steps);
  return LOAD_BANDS[idx]!;
}

export type ComputeReadinessInput = {
  sleepQuality: SleepQuality;
  stressScore: number;
  fatigueScore: number;
  sorenessScore: number;
  /** 周期等额外扣分（0–100 分制上的扣减） */
  cyclePenalty?: number;
  /** 近若干日 readinessScore，用于个人基线 */
  recentScores?: number[];
};

// 推导步骤：四维 Hooper 和 → 百分制 → 周期扣分 → 可选个人基线降档 → 负荷带
export function computeReadiness(
  input: ComputeReadinessInput
): ReadinessDimensionBreakdown {
  const sleepHooper = mapSleepToHooper(input.sleepQuality);
  const stressHooper = map0to10ToHooper(input.stressScore);
  const fatigueHooper = map0to10ToHooper(input.fatigueScore);
  const sorenessHooper = map0to10ToHooper(input.sorenessScore);
  const hooperSum =
    sleepHooper + stressHooper + fatigueHooper + sorenessHooper;

  // 4–28 → 100–0；分母 24 = 28-4
  let readinessScore = Math.round((100 * (28 - hooperSum)) / 24);
  const cyclePenalty = Math.max(0, Math.round(input.cyclePenalty ?? 0));
  readinessScore = Math.max(0, Math.min(100, readinessScore - cyclePenalty));

  let baselineAdjustment = 0;
  const recent = (input.recentScores ?? []).filter((n) =>
    Number.isFinite(n)
  );
  if (recent.length >= 7) {
    const mean = recent.reduce((a, b) => a + b, 0) / recent.length;
    if (mean - readinessScore >= 15) {
      baselineAdjustment = 1;
    }
  }

  let loadBand = loadBandFromScore(readinessScore);
  if (baselineAdjustment > 0) {
    loadBand = shiftBandDown(loadBand, baselineAdjustment);
  }

  return {
    sleepHooper,
    stressHooper,
    fatigueHooper,
    sorenessHooper,
    hooperSum,
    cyclePenalty,
    baselineAdjustment,
    readinessScore,
    loadBand,
  };
}

/** 教练摘要用粗色：rest=红，modified=黄，full=绿 */
export function loadBandTone(
  bandId: LoadBandId
): "red" | "yellow" | "green" {
  if (bandId === "rest_energy") return "red";
  if (bandId === "modified_70" || bandId === "modified_50") return "yellow";
  return "green";
}
