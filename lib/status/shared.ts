import { PAIN_AREA_LABEL, isPainArea, type PainArea } from "@/lib/clinical/painAreas";
import { type PreQuadrant } from "@/lib/clinical/preQuadrant";
import { computeCasePainTrend, type CasePainTrendView } from "@/lib/clinical/injuryTrend";
import {
  isPainExerciseRelation,
  type InjuryCaseStatus,
  type InjuryKind,
  type InjuryNoteKind,
  type PainExerciseRelationId,
} from "@/lib/clinical/injuryKinds";
import { SAME_DAY_MUTATION_ERROR, formatDateOnly } from "@/lib/dateOnly";
import { isTeamTodayDateOnly } from "@/lib/season/timeZone";
import {
  type PhysiologicalLoadTag,
} from "@/lib/clinical/physiologicalLoad";
import type {
  CycleConfidence,
  CyclePhaseCode,
} from "@/lib/clinical/cyclePhase";
import type {
  CycleEnergyLevel,
  CycleMoodLevel,
} from "@/lib/cycleTypes";
import type { ActionErr } from "@/lib/actionResult";

export { errorMessage } from "@/lib/actionResult";

/** 伤病不写本机草稿；失败须联网重试 */
export const INJURY_ONLINE_ONLY_COPY =
  "伤病须联网提交。失败不会写入本机，请检查网络后重试。";

// 推导步骤：云端改删只认记录 date 的队时区自然日，不认 UTC 日界
export function rejectIfNotToday(
  dateStr: string,
  timeZone: string,
  now: Date = new Date()
): ActionErr | null {
  if (typeof dateStr !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return { success: false, error: "date 须为 YYYY-MM-DD" };
  }
  if (!isTeamTodayDateOnly(dateStr, timeZone, now)) {
    return { success: false, error: SAME_DAY_MUTATION_ERROR };
  }
  return null;
}

const QUADRANTS = new Set<PreQuadrant>([
  "slack",
  "real_fatigue",
  "injury_risk",
  "peak",
]);

export function asPainArea(value: unknown): PainArea | null {
  return isPainArea(value) ? value : null;
}

export function clampScore0to10(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(10, Math.round(value)));
}

export function asQuadrant(value: unknown): PreQuadrant | null {
  return typeof value === "string" && QUADRANTS.has(value as PreQuadrant)
    ? (value as PreQuadrant)
    : null;
}

const CYCLE_ENERGY_LEVELS = new Set<CycleEnergyLevel>(["low", "mid", "high"]);
const CYCLE_MOOD_LEVELS = new Set<CycleMoodLevel>(["steady", "irritable", "low"]);
const CYCLE_PHASE_CODES = new Set<CyclePhaseCode>([
  "menstrual",
  "follicular",
  "ovulation",
  "luteal",
  "late_luteal",
]);
const CYCLE_CONFIDENCES = new Set<CycleConfidence>(["low", "medium", "high"]);
const LOAD_TAGS = new Set<PhysiologicalLoadTag>([
  "recover_high",
  "acl_caution",
  "maintain",
  "peak_ok",
  "monitor_health",
]);

export function asCycleEnergy(value: unknown): CycleEnergyLevel | null {
  return typeof value === "string" && CYCLE_ENERGY_LEVELS.has(value as CycleEnergyLevel)
    ? (value as CycleEnergyLevel)
    : null;
}
export function asCycleMood(value: unknown): CycleMoodLevel | null {
  return typeof value === "string" && CYCLE_MOOD_LEVELS.has(value as CycleMoodLevel)
    ? (value as CycleMoodLevel)
    : null;
}
export function asCyclePhaseCode(value: unknown): CyclePhaseCode | null {
  return typeof value === "string" && CYCLE_PHASE_CODES.has(value as CyclePhaseCode)
    ? (value as CyclePhaseCode)
    : null;
}
export function asCycleConfidence(value: unknown): CycleConfidence | null {
  return typeof value === "string" && CYCLE_CONFIDENCES.has(value as CycleConfidence)
    ? (value as CycleConfidence)
    : null;
}
export function asLoadTag(value: unknown): PhysiologicalLoadTag | null {
  return typeof value === "string" && LOAD_TAGS.has(value as PhysiologicalLoadTag)
    ? (value as PhysiologicalLoadTag)
    : null;
}

export type InjuryPainLogDto = {
  id: string;
  date: string;
  painScore: number;
  painExerciseRelations: PainExerciseRelationId[];
  note: string | null;
  createdAt: string;
};

export type InjuryNoteDto = {
  id: string;
  kind: InjuryNoteKind;
  date: string;
  content: string;
  createdAt: string;
};

export type InjuryCaseDto = {
  id: string;
  playerId: string;
  painArea: PainArea;
  painAreaLabel: string;
  locationHint: string;
  injuryKind: InjuryKind;
  status: InjuryCaseStatus;
  startDate: string;
  recoveredAt: string | null;
  parentCaseId: string | null;
  painLogs: InjuryPainLogDto[];
  notes: InjuryNoteDto[];
  latestPain: number | null;
  trend: CasePainTrendView;
};

export type CaseRow = {
  id: string;
  playerId: string;
  painArea: PainArea;
  locationHint: string;
  injuryKind: InjuryKind;
  status: InjuryCaseStatus;
  startDate: Date;
  recoveredAt: Date | null;
  parentCaseId: string | null;
  painLogs: {
    id: string;
    date: Date;
    painScore: number;
    painExerciseRelations: string[];
    note: string | null;
    createdAt: Date;
  }[];
  notes: {
    id: string;
    kind: InjuryNoteKind;
    date: Date;
    content: string;
    createdAt: Date;
  }[];
};

export function mapCase(row: CaseRow): InjuryCaseDto {
  const painLogs: InjuryPainLogDto[] = row.painLogs
    .slice()
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .map((log) => ({
      id: log.id,
      date: formatDateOnly(log.date),
      painScore: log.painScore,
      painExerciseRelations: log.painExerciseRelations.filter(isPainExerciseRelation),
      note: log.note,
      createdAt: log.createdAt.toISOString(),
    }));
  const notes: InjuryNoteDto[] = row.notes
    .slice()
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .map((n) => ({
      id: n.id,
      kind: n.kind,
      date: formatDateOnly(n.date),
      content: n.content,
      createdAt: n.createdAt.toISOString(),
    }));
  const latestPain =
    painLogs.length > 0 ? painLogs[painLogs.length - 1]!.painScore : null;
  return {
    id: row.id,
    playerId: row.playerId,
    painArea: row.painArea,
    painAreaLabel: PAIN_AREA_LABEL[row.painArea],
    locationHint: row.locationHint,
    injuryKind: row.injuryKind,
    status: row.status,
    startDate: formatDateOnly(row.startDate),
    recoveredAt: row.recoveredAt ? formatDateOnly(row.recoveredAt) : null,
    parentCaseId: row.parentCaseId,
    painLogs,
    notes,
    latestPain,
    trend: computeCasePainTrend({
      painArea: row.painArea,
      painLogs: painLogs.map((l) => ({
        date: l.date,
        painScore: l.painScore,
        createdAt: l.createdAt,
      })),
    }),
  };
}

export const caseInclude = {
  painLogs: true,
  notes: true,
} as const;
