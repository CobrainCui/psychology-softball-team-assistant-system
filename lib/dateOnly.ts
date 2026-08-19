/** 正午 UTC，避免时区把 YYYY-MM-DD 推到前一天 */
export function parseDateOnly(dateStr: string): Date {
  return new Date(`${dateStr}T12:00:00.000Z`);
}

export function formatDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** 与 getTodayDateStr 同一套 UTC 日历日，用于云端当日改删门闩 */
export function isTodayDateOnly(
  dateStr: string,
  today: Date = new Date()
): boolean {
  return dateStr === today.toISOString().slice(0, 10);
}

export const SAME_DAY_MUTATION_ERROR = "仅可修改或删除当日记录";

