/** 正午 UTC，避免时区把 YYYY-MM-DD 推到前一天 */
export function parseDateOnly(dateStr: string): Date {
  return new Date(`${dateStr}T12:00:00.000Z`);
}

export function formatDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** YYYY-MM-DD 按日历加减天（正午 UTC，不经过本地时区） */
export function addCalendarDays(dateStr: string, days: number): string {
  const next = parseDateOnly(dateStr);
  next.setUTCDate(next.getUTCDate() + days);
  return formatDateOnly(next);
}

/** YYYY-MM-DD 业务日：优先显式队时区日，否则 UTC 日历日（禁止浏览器本地 getFullYear） */
export function asOfDateStrFrom(
  asOfDateStr?: string,
  fallback: Date = new Date()
): string {
  if (asOfDateStr && /^\d{4}-\d{2}-\d{2}$/.test(asOfDateStr)) return asOfDateStr;
  return fallback.toISOString().slice(0, 10);
}

/** UTC 日历日 YYYY-MM-DD。业务“今日”用 getTeamTodayDateStr，禁止当 today-only */
export function getTodayDateStr(today: Date = new Date()): string {
  return today.toISOString().slice(0, 10);
}

export const SAME_DAY_MUTATION_ERROR = "仅可修改或删除当日记录";
export const ARCHIVE_SAME_DAY_ERROR =
  "只能归档队时区当日的测试日，或次日补归档";

