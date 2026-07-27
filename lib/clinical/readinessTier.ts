// 从已落库的 Readiness 字段还原红/黄/绿档位（队内启发式，非临床量表）。
// 周期排卵安全帽以当日 physiologicalLoadTag / 落库分数为准；教练端另见脱敏负荷标签。

import {
  PAIN_AREA_LABEL,
  PAIN_CIRCUIT_BREAKER_THRESHOLD,
  type PainArea,
} from "@/lib/clinical/painAreas";
import type { ProbeFeedback } from "@/lib/readinessHistory";

export type ReadinessTier = "red" | "yellow" | "green";

export type ReadinessCheckSignals = {
  readinessScore: number;
  hasNewInjury: boolean;
  injuryPart: PainArea | null;
  injuryScore: number;
  probeFeedback: ProbeFeedback | null;
};

export type DerivedReadinessTier = {
  tier: ReadinessTier;
  /** 教练摘要用短因 */
  reason: string;
  injuryPartLabel: string | null;
};

// 推导步骤：熔断优先 → 分数<70 / 新伤 / 探针 B → 其余绿
export function deriveReadinessTier(
  signals: ReadinessCheckSignals
): DerivedReadinessTier {
  const injuryPartLabel = signals.injuryPart
    ? PAIN_AREA_LABEL[signals.injuryPart]
    : null;

  const isNewInjuryCritical =
    signals.hasNewInjury &&
    signals.injuryScore >= PAIN_CIRCUIT_BREAKER_THRESHOLD;
  const isProbeCritical = signals.probeFeedback === "C";

  if (isNewInjuryCritical || isProbeCritical) {
    return {
      tier: "red",
      reason: isProbeCritical ? "历史伤病复测加剧" : "新发伤病熔断",
      injuryPartLabel,
    };
  }

  // 历史：红牌当日强制 score=0；兼容异常 0 分
  if (signals.readinessScore === 0) {
    return {
      tier: "red",
      reason: "综合分熔断",
      injuryPartLabel,
    };
  }

  const isProbeCaution = signals.probeFeedback === "B";
  const needsCaution = signals.hasNewInjury || isProbeCaution;
  let tier: ReadinessTier =
    signals.readinessScore >= 70 ? "green" : "yellow";
  if (needsCaution && tier === "green") tier = "yellow";

  if (tier === "yellow") {
    const parts: string[] = [];
    if (signals.readinessScore < 70) parts.push("准备度偏低");
    if (signals.hasNewInjury) parts.push("新发伤病减负");
    if (isProbeCaution) parts.push("历史伤病恢复中");
    return {
      tier: "yellow",
      reason: parts.join(" · ") || "建议减量",
      injuryPartLabel,
    };
  }

  return {
    tier: "green",
    reason: "可按计划训练",
    injuryPartLabel,
  };
}
