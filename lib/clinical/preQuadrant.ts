// 运动前四象限：身体电量 X × 心理动力 Y。非医疗诊断。

import type { Scale5 } from "@/lib/clinical/preDimensions";

export const PRE_RULE_VERSION = "pre_quadrant_v1";

export type PreQuadrant = "slack" | "real_fatigue" | "injury_risk" | "peak";

export type WellnessInput = {
  sleep: Scale5;
  stress: Scale5;
  fatigue: Scale5;
  soreness: Scale5;
  willingness: Scale5;
};

export type PreFeedbackResult = {
  physicalBattery: number;
  mentalDrive: number;
  quadrant: PreQuadrant;
  title: string;
  narrative: string;
  ruleVersion: string;
};

const PERIOD_QUADRANT_NARRATIVE: Record<PreQuadrant, string> = {
  slack:
    "经期里身体电量不低，但今天不太想动——很常见。可以选择慢走、轻量传接，或今天完全休息；请按自己的舒适度调整，不适明显时不必勉强。",
  real_fatigue:
    "经期里身心信号都偏紧，今天更适合把恢复放在前面。可以选择安心休息与补水，或只做很轻的拉伸；请以当下感受为准，不适明显时优先停训观察。",
  injury_risk:
    "经期里你仍想训练，但恢复信号偏弱。可以选择温和拉伸或低强度传接，并避免大力传杀与急停变向；若腹痛或乏力明显，今天休息也是合理选择。",
  peak:
    "经期里身心都在线时，并不等于必须停训。可以按原计划适度进行，或换成更轻松的安排；若某动作让腹压或不适感加重，请及时调整并注意补水。",
};

export const QUADRANT_LABEL: Record<PreQuadrant, string> = {
  slack: "身体准备好了，只是还没想动",
  real_fatigue: "身心都在说：先休息",
  injury_risk: "心里很想动，身体还没准备好",
  peak: "身体和动力都很在线",
};

function formatScore(x: number): string {
  return x.toFixed(1);
}

const QUADRANT_NARRATIVE: Record<PreQuadrant, (x: number) => string> = {
  slack: (x) =>
    `身体的电量不低（${formatScore(x)}分），只是今天不太想动——这很正常，不代表偷懒。\n\n可以选择轻量传接或技术慢动作；如果热身后还是提不起劲，今天休息也完全可以。`,
  real_fatigue: (x) =>
    `身体电量偏低（${formatScore(x)}分），运动意愿也不高——这是身体在提醒你需要恢复。\n\n可以选择彻底休息，或做一些温和拉伸；一切以此刻的身体感受为准。`,
  injury_risk: (x) =>
    `今天很想训练，但睡眠、精力或肌肉舒适度还偏低（电量 ${formatScore(x)} 分）。\n\n可以试着降低传杀与跑垒强度或缩短时间；热身后如果还是明显疲惫或疼痛，选择休息，也是在好好照顾身体。`,
  peak: (x) =>
    `身体电量（${formatScore(x)}分）和运动意愿都在不错的区间，是适合训练的一天。\n\n可以按计划进行打击、传杀与跑垒；过程中记得留意身体给你的反馈，感觉不对时随时调整。`,
};

/** X：身体电量 = (睡眠恢复 + 心理放松 + 躯体精力 + 肌肉舒适) / 4 */
export function computePhysicalBattery(input: WellnessInput): number {
  const sum = input.sleep + input.stress + input.fatigue + input.soreness;
  return Math.round((sum / 4) * 10) / 10;
}

/** Y：心理动力 = 运动渴望度 */
export function computeMentalDrive(input: WellnessInput): number {
  return input.willingness;
}

/**
 * 象限判定（Y 为整数 1–5，无中间带）：
 * slack：X≥3 且 Y≤2
 * real_fatigue：X<3 且 Y≤2
 * injury_risk：X<3 且 Y≥3
 * peak：X≥3 且 Y≥3
 */
export function resolveQuadrant(x: number, y: number): PreQuadrant {
  const highBattery = x >= 3;
  const lowDrive = y <= 2;
  if (highBattery && lowDrive) return "slack";
  if (!highBattery && lowDrive) return "real_fatigue";
  if (!highBattery && !lowDrive) return "injury_risk";
  return "peak";
}

export function resolveDisplayNarrative(
  quadrant: PreQuadrant,
  defaultNarrative: string,
  inMenstrualPeriod: boolean
): string {
  if (inMenstrualPeriod) return PERIOD_QUADRANT_NARRATIVE[quadrant];
  return defaultNarrative;
}

// 推导步骤：四维均值 → 电量 X；意愿 → 动力 Y → 象限 → 经期可替换叙事
export function buildPreFeedback(params: {
  input: WellnessInput;
  inMenstrualPeriod?: boolean;
}): PreFeedbackResult {
  const { input, inMenstrualPeriod = false } = params;
  const physicalBattery = computePhysicalBattery(input);
  const mentalDrive = computeMentalDrive(input);
  const quadrant = resolveQuadrant(physicalBattery, mentalDrive);
  const baseNarrative = QUADRANT_NARRATIVE[quadrant](physicalBattery);
  return {
    physicalBattery,
    mentalDrive,
    quadrant,
    title: QUADRANT_LABEL[quadrant],
    narrative: resolveDisplayNarrative(
      quadrant,
      baseNarrative,
      inMenstrualPeriod
    ),
    ruleVersion: PRE_RULE_VERSION,
  };
}

export function quadrantLabel(quadrant: PreQuadrant): string {
  return QUADRANT_LABEL[quadrant];
}
