// 上场可用性：仅由运动损伤模块（VAS + 探针）推导，与 Readiness 解耦。

import {
  PAIN_AREA_LABEL,
  PAIN_CIRCUIT_BREAKER_THRESHOLD,
  type PainArea,
} from "@/lib/clinical/painAreas";
import type { ProbeFeedback } from "@/lib/readinessHistory";

export type AvailabilityStatus = "full" | "modified" | "unavailable";

export const AVAILABILITY_STATUS_LABEL: Record<AvailabilityStatus, string> = {
  full: "完全可用",
  modified: "限制性可用",
  unavailable: "伤缺",
};

export type AvailabilitySignals = {
  painScore: number;
  probeFeedback?: ProbeFeedback | null;
  /** 明确无活动伤（例如探针 A 清伤） */
  cleared?: boolean;
};

// 推导步骤：清伤→Full；探针 C 或 VAS≥熔断→Unavailable；VAS3–5 或探针 B→Modified；否则 Full
export function deriveAvailabilityStatus(
  signals: AvailabilitySignals
): AvailabilityStatus {
  if (signals.cleared) return "full";
  if (signals.probeFeedback === "C") return "unavailable";
  if (signals.painScore >= PAIN_CIRCUIT_BREAKER_THRESHOLD) {
    return "unavailable";
  }
  if (signals.probeFeedback === "B") return "modified";
  if (signals.painScore >= 3) return "modified";
  return "full";
}

export function availabilityLabel(status: AvailabilityStatus): string {
  return AVAILABILITY_STATUS_LABEL[status];
}

export function formatAvailabilityLine(
  status: AvailabilityStatus,
  painArea: PainArea | null
): string {
  const base = availabilityLabel(status);
  if (!painArea || status === "full") return base;
  return `${base} · ${PAIN_AREA_LABEL[painArea]}`;
}

/** 近 N 天未解除：非 full，且探针不是 A */
export const AVAILABILITY_LOOKBACK_DAYS = 7;
