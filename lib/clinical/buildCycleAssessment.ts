// 评估页周期上下文：由 CycleProfileDto + 当日症状推导阶段/扣分/脱敏标签/RED-S。

import {
  getCyclePhase,
  getFemaleCyclePenalty,
  type CyclePhase,
} from "@/lib/clinical/cyclePhase";
import {
  getCycleGuidance,
  getSymptomDrivenGuidance,
  type CycleGuidance,
} from "@/lib/clinical/cycleGuidance";
import {
  resolvePhysiologicalLoadTag,
  type PhysiologicalLoadTag,
} from "@/lib/clinical/physiologicalLoad";
import {
  estimateMissedExpectedPeriods,
  evaluateRedsSignals,
  type RedsEvaluation,
} from "@/lib/clinical/redsWatch";
import type { CycleProfileDto } from "@/lib/cycleTypes";
import type { SleepQuality } from "@/lib/readinessHistory";

export type CycleSymptomInput = {
  crampsScore: number;
  cycleEnergy: "low" | "mid" | "high" | null;
  cycleMood: "steady" | "irritable" | "low" | null;
  cycleIrregular: boolean;
};

export type CycleAssessmentBundle = {
  phase: CyclePhase | null;
  guidance: CycleGuidance | null;
  penalty: number;
  loadTag: PhysiologicalLoadTag | null;
  reds: RedsEvaluation;
  showAclCues: boolean;
  showFemaleRedFlags: boolean;
};

function avg(nums: number[]): number | null {
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

// 推导步骤：档案开关 → 阶段推算 → RED-S → 负荷标签 → 扣分与文案
export function buildCycleAssessmentBundle(input: {
  profile: CycleProfileDto | null;
  periodStartDate: string;
  symptoms: CycleSymptomInput;
  fatigueScore: number;
  sorenessScore: number;
  recentSleep: SleepQuality[];
  recentFatigue: number[];
}): CycleAssessmentBundle {
  const empty: CycleAssessmentBundle = {
    phase: null,
    guidance: null,
    penalty: 0,
    loadTag: null,
    reds: { triggered: false, hitCount: 0, reasons: [] },
    showAclCues: false,
    showFemaleRedFlags: false,
  };

  const { profile, periodStartDate, symptoms } = input;
  if (!profile?.consentAt || !profile.trackingEnabled) {
    return empty;
  }

  const hidePhaseLabels =
    profile.hormonalContraception || profile.highVariance;

  const phase =
    periodStartDate && /^\d{4}-\d{2}-\d{2}$/.test(periodStartDate)
      ? getCyclePhase(periodStartDate, new Date(), {
          cycleLengthDays: profile.resolvedLengthDays,
          confidence: profile.confidence,
          hidePhaseLabels,
        })
      : null;

  const missed = estimateMissedExpectedPeriods(
    periodStartDate || profile.lastPeriodStart,
    profile.resolvedLengthDays
  );
  const badSleepRatio =
    input.recentSleep.length === 0
      ? null
      : input.recentSleep.filter((s) => s === "bad").length /
        input.recentSleep.length;

  const reds = evaluateRedsSignals({
    selfReportedIrregular: symptoms.cycleIrregular,
    missedExpectedPeriods: missed,
    avgFatigue30d: avg(input.recentFatigue),
    badSleepRatio30d: badSleepRatio,
    bodyImageAnxietyOptIn: profile.bodyImageAnxietyOptIn,
  });

  const loadTag = resolvePhysiologicalLoadTag({
    phase,
    fatigueScore: input.fatigueScore,
    sorenessScore: input.sorenessScore,
    crampsScore: symptoms.crampsScore,
    redsTriggered: reds.triggered,
  });

  const symptomOnly = !phase || hidePhaseLabels || phase.confidence === "low";
  const penalty = getFemaleCyclePenalty(phase, input.fatigueScore, {
    crampsScore: symptoms.crampsScore,
    symptomOnly,
  });

  let guidance: CycleGuidance | null = null;
  if (phase && !hidePhaseLabels) {
    guidance = getCycleGuidance(phase);
  } else if (symptoms.crampsScore > 0 || symptomOnly) {
    guidance = getSymptomDrivenGuidance(symptoms.crampsScore);
  }

  return {
    phase,
    guidance,
    penalty,
    loadTag,
    reds,
    showAclCues: Boolean(phase?.isOvulation && !hidePhaseLabels),
    showFemaleRedFlags: reds.triggered || symptoms.cycleIrregular,
  };
}
