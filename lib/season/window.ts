import { formatDateOnly } from "@/lib/dateOnly";
import { zonedDateStr } from "@/lib/season/timeZone";
import type { ScheduleEventStatus } from "@/lib/season/types";

export function rangesOverlap(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string
): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}

export function dateStrFromDb(value: Date): string {
  return formatDateOnly(value);
}

/** 比赛窗口只认 planned，排除 cancelled / completed */
export function isInPlannedMatchWindow(
  now: Date,
  startAt: Date,
  endAt: Date,
  status: ScheduleEventStatus
): boolean {
  if (status !== "planned") return false;
  return now.getTime() >= startAt.getTime() && now.getTime() <= endAt.getTime();
}

export function formatInstantInZone(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone,
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(instant);
}

export function eventAttributionDate(startAt: Date, timeZone: string): string {
  return zonedDateStr(startAt, timeZone);
}

export function sessionAttributionDate(
  archivedAt: Date,
  timeZone: string
): string {
  return zonedDateStr(archivedAt, timeZone);
}

export function inSeasonRange(
  dateStr: string,
  startsOn: string,
  effectiveEndsOn: string
): boolean {
  return dateStr >= startsOn && dateStr <= effectiveEndsOn;
}

export function inCalendarYear(dateStr: string, year: number): boolean {
  return dateStr >= `${year}-01-01` && dateStr <= `${year}-12-31`;
}
