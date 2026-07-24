// 伤病处方归档：prehab 写入，个人档案读取。

import { STORAGE_KEYS } from "@/lib/storageKeys";
import { safeParseJSON } from "@/lib/safeParse";
import { isPainArea, type PainArea } from "@/lib/clinical/painAreas";

export const INJURY_LOG_SCHEMA_VERSION = 1;

export interface InjuryLogEntry {
  schemaVersion: number;
  id: string;
  playerId: string;
  playerName: string;
  painArea: PainArea;
  painAreaLabel: string;
  painScore: number;
  symptom: string;
  timestamp: number;
}

function isInjuryLogEntry(value: unknown): value is InjuryLogEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.id === "string" &&
    typeof entry.playerId === "string" &&
    typeof entry.playerName === "string" &&
    isPainArea(entry.painArea) &&
    typeof entry.painScore === "number" &&
    typeof entry.timestamp === "number"
  );
}

export function loadInjuryLog(): InjuryLogEntry[] {
  const raw = localStorage.getItem(STORAGE_KEYS.injuryLog);
  const parsed = safeParseJSON<unknown>(raw, []);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(isInjuryLogEntry);
}

export function appendInjuryLogEntry(
  entry: Omit<InjuryLogEntry, "schemaVersion" | "id" | "timestamp"> & {
    id?: string;
    timestamp?: number;
  }
): InjuryLogEntry {
  const full: InjuryLogEntry = {
    schemaVersion: INJURY_LOG_SCHEMA_VERSION,
    id: entry.id ?? crypto.randomUUID(),
    playerId: entry.playerId,
    playerName: entry.playerName,
    painArea: entry.painArea,
    painAreaLabel: entry.painAreaLabel,
    painScore: entry.painScore,
    symptom: entry.symptom,
    timestamp: entry.timestamp ?? Date.now(),
  };
  const updated = [...loadInjuryLog(), full];
  localStorage.setItem(STORAGE_KEYS.injuryLog, JSON.stringify(updated));
  return full;
}

export function loadPlayerInjuryLog(playerId: string): InjuryLogEntry[] {
  return loadInjuryLog()
    .filter((entry) => entry.playerId === playerId)
    .sort((a, b) => b.timestamp - a.timestamp);
}
