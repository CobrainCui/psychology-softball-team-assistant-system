import { parseDateOnly } from "@/lib/dateOnly";

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
export function zonedDateStr(instant: Date, timeZone: string): string {
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

export function minDateStr(a: string, b: string): string {
  return a <= b ? a : b;
}

export function calendarYearOf(dateStr: string): number {
  return Number(dateStr.slice(0, 4));
}

export function yearRange(year: number): { start: string; end: string } {
  return { start: `${year}-01-01`, end: `${year}-12-31` };
}
