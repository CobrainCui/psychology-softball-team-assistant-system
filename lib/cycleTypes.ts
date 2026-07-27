// 生理周期前后端共享类型（禁止放入 "use server" 文件以免污染客户端 bundle）

import type { CycleConfidence } from "@/lib/clinical/cyclePhase";

export type CycleSharingLevel = "none" | "load_only" | "phase_label";
export type CycleEnergyLevel = "low" | "mid" | "high";
export type CycleMoodLevel = "steady" | "irritable" | "low";

export type CycleProfileDto = {
  trackingEnabled: boolean;
  sharingLevel: CycleSharingLevel;
  typicalLengthDays: number | null;
  hormonalContraception: boolean;
  bodyImageAnxietyOptIn: boolean;
  consentAt: string | null;
  periodStartDates: string[];
  lastPeriodStart: string | null;
  resolvedLengthDays: number;
  confidence: CycleConfidence;
  highVariance: boolean;
};
