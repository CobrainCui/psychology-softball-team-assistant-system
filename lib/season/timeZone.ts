import { addCalendarDays, parseDateOnly } from "@/lib/dateOnly";

const DEFAULT_TZ = "Asia/Shanghai";

export function isValidIanaTimeZone(tz: string): boolean {
  const trimmed = tz.trim();
  if (!trimmed) return false;
  try {
    Intl.DateTimeFormat("en-US", { timeZone: trimmed }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export function resolveTeamTimeZone(tz: string | null | undefined): string {
  if (tz && isValidIanaTimeZone(tz)) return tz.trim();
  return DEFAULT_TZ;
}

/** 队时区自然日 YYYY-MM-DD */
export function zonedDateStr(
  instant: Date,
  timeZone: string | null | undefined
): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: resolveTeamTimeZone(timeZone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;
  if (!year || !month || !day) return instant.toISOString().slice(0, 10);
  return `${year}-${month}-${day}`;
}

export function dateOnlyFromZoned(instant: Date, timeZone: string): Date {
  return parseDateOnly(zonedDateStr(instant, timeZone));
}

/** 队时区自然日；健康 / 反馈 / 伤病 / 教练摘要的“今日”只走这里 */
export function getTeamTodayDateStr(
  timeZone: string | null | undefined,
  instant: Date = new Date()
): string {
  return zonedDateStr(instant, timeZone);
}

export function isTeamTodayDateOnly(
  dateStr: string,
  timeZone: string | null | undefined,
  instant: Date = new Date()
): boolean {
  return dateStr === getTeamTodayDateStr(timeZone, instant);
}

/** 测试日可在队时区当日归档，或次日补归档（跨午夜晚场） */
export function isWithinTestDayArchiveWindow(
  draftDate: string,
  timeZone: string | null | undefined,
  instant: Date = new Date()
): boolean {
  const today = getTeamTodayDateStr(timeZone, instant);
  return draftDate === today || draftDate === addCalendarDays(today, -1);
}

export function minDateStr(a: string, b: string): string {
  return a <= b ? a : b;
}

export function calendarYearOf(dateStr: string): number {
  return Number(dateStr.slice(0, 4));
}

export function yearRange(year: number): { start: string; end: string } {
  return { start: `${year}-01-01`, end: `${year}-12-31` };
}
