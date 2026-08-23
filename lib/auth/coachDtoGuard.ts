/** 教练摘要禁止出现的周期原文 / 备注字段名 */
export const COACH_DTO_FORBIDDEN_KEYS = [
  "note",
  "content",
  "periodStartDates",
  "periodStartEvents",
  "lastPeriodStart",
  "crampsScore",
  "hormonalContraception",
  "bodyImageAnxietyOptIn",
  "typicalLengthDays",
  "consentAt",
  "sharingLevel",
] as const;

// 推导步骤：递归扫对象键；命中禁止字段即泄漏
export function findForbiddenCoachDtoKey(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const hit = findForbiddenCoachDtoKey(item);
      if (hit) return hit;
    }
    return null;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if ((COACH_DTO_FORBIDDEN_KEYS as readonly string[]).includes(key)) {
      return key;
    }
    const hit = findForbiddenCoachDtoKey(child);
    if (hit) return hit;
  }
  return null;
}

export function coachDtoContainsSecret(
  value: unknown,
  secret: string
): boolean {
  if (!secret) return false;
  return JSON.stringify(value).includes(secret);
}
