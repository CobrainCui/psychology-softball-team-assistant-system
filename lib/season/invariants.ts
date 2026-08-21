import type {
  GameResultKind,
  ScheduleEventKind,
  ScheduleEventStatus,
  SeasonStatus,
} from "@/lib/season/types";

export function canActivateSeason(status: SeasonStatus): boolean {
  return status === "planned";
}

export function canArchiveSeason(status: SeasonStatus): boolean {
  return status === "active";
}

export function canMutateSeason(status: SeasonStatus): boolean {
  return status !== "archived";
}

export function canDeleteSeason(status: SeasonStatus): boolean {
  return status === "planned";
}

export function canTransitionEvent(
  from: ScheduleEventStatus,
  to: ScheduleEventStatus
): boolean {
  if (from === to) return true;
  if (from === "planned" && (to === "cancelled" || to === "completed")) {
    return true;
  }
  if (from === "cancelled" && to === "planned") return true;
  return false;
}

export function canDeleteEvent(status: ScheduleEventStatus): boolean {
  return status === "planned";
}

export function canUploadToEvent(
  eventStatus: ScheduleEventStatus,
  seasonStatus: SeasonStatus | null
): boolean {
  if (seasonStatus === "archived") return false;
  return eventStatus === "planned" || eventStatus === "completed";
}

export function requiresSeason(kind: ScheduleEventKind): boolean {
  return kind === "game";
}

export function resultFromScores(
  ourScore: number,
  opponentScore: number
): GameResultKind {
  if (ourScore > opponentScore) return "win";
  if (ourScore < opponentScore) return "loss";
  return "tie";
}

export function scoresAgreeWithResult(
  ourScore: number | null,
  opponentScore: number | null,
  result: GameResultKind
): { ok: true } | { ok: false; error: string } {
  if (result === "unknown") return { ok: true };
  if (ourScore == null || opponentScore == null) {
    return { ok: false, error: "胜负结果须同时填写比分" };
  }
  const derived = resultFromScores(ourScore, opponentScore);
  if (derived !== result) {
    return { ok: false, error: "比分与胜负结果不一致" };
  }
  return { ok: true };
}

export const RECORD_UPDATED_ERROR = "记录已更新，请刷新";
