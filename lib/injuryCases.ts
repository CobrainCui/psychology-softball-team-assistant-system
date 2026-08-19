// 损伤 episode 本地草稿：云端失败时降级。

import { STORAGE_KEYS } from "@/lib/storageKeys";
import { safeParseJSON } from "@/lib/safeParse";
import { isPainArea, type PainArea } from "@/lib/clinical/painAreas";
import {
  isInjuryKind,
  isPainExerciseRelation,
  type InjuryCaseStatus,
  type InjuryKind,
  type InjuryNoteKind,
  type PainExerciseRelationId,
} from "@/lib/clinical/injuryKinds";

export const INJURY_CASE_SCHEMA_VERSION = 2;

export type InjuryPainLogDraft = {
  id: string;
  date: string;
  painScore: number;
  painExerciseRelations: PainExerciseRelationId[];
  note?: string;
  createdAt: string;
  updatedAt?: string;
};

export type InjuryNoteDraft = {
  id: string;
  kind: InjuryNoteKind;
  date: string;
  content: string;
  createdAt: string;
};

export type InjuryCaseDraft = {
  schemaVersion: number;
  id: string;
  playerId: string;
  painArea: PainArea;
  locationHint: string;
  injuryKind: InjuryKind;
  status: InjuryCaseStatus;
  startDate: string;
  recoveredAt?: string | null;
  parentCaseId?: string | null;
  painLogs: InjuryPainLogDraft[];
  notes: InjuryNoteDraft[];
  createdAt: string;
  updatedAt: string;
};

function isCase(value: unknown): value is InjuryCaseDraft {
  if (!value || typeof value !== "object") return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.id === "string" &&
    typeof entry.playerId === "string" &&
    isPainArea(entry.painArea) &&
    isInjuryKind(entry.injuryKind)
  );
}

export function loadInjuryCaseDrafts(): InjuryCaseDraft[] {
  const raw = localStorage.getItem(STORAGE_KEYS.injuryCases);
  const parsed = safeParseJSON<unknown>(raw, []);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(isCase).map((c) => ({
    ...c,
    locationHint: typeof c.locationHint === "string" ? c.locationHint : "",
    painLogs: Array.isArray(c.painLogs)
      ? c.painLogs.map((log) => ({
          ...log,
          painExerciseRelations: (log.painExerciseRelations ?? []).filter(
            isPainExerciseRelation
          ),
        }))
      : [],
    notes: Array.isArray(c.notes) ? c.notes : [],
  }));
}

export function saveInjuryCaseDrafts(cases: InjuryCaseDraft[]): void {
  localStorage.setItem(STORAGE_KEYS.injuryCases, JSON.stringify(cases));
}

export function upsertInjuryCaseDraft(next: InjuryCaseDraft): InjuryCaseDraft {
  const existing = loadInjuryCaseDrafts().filter((c) => c.id !== next.id);
  saveInjuryCaseDrafts([...existing, next]);
  return next;
}

export function loadPlayerInjuryCaseDrafts(playerId: string): InjuryCaseDraft[] {
  return loadInjuryCaseDrafts()
    .filter((c) => c.playerId === playerId)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
