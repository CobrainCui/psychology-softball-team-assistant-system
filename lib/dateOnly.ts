/** 正午 UTC，避免时区把 YYYY-MM-DD 推到前一天 */
export function parseDateOnly(dateStr: string): Date {
  return new Date(`${dateStr}T12:00:00.000Z`);
}

export function formatDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}
