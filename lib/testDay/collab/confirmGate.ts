// 测试日确认闸：与 in-flight 提交同步互斥。纯内存，不碰 Prisma。

const inflightByDraft = new Map<string, number>();
const confirmingByDraft = new Set<string>();

export function countInflightTestDaySubmits(draftId: string): number {
  return inflightByDraft.get(draftId) ?? 0;
}

export function beginInflightTestDaySubmit(draftId: string): void {
  inflightByDraft.set(draftId, countInflightTestDaySubmits(draftId) + 1);
}

export function endInflightTestDaySubmit(draftId: string): void {
  const next = countInflightTestDaySubmits(draftId) - 1;
  if (next <= 0) inflightByDraft.delete(draftId);
  else inflightByDraft.set(draftId, next);
}

export function isConfirmingTestDayDraft(draftId: string): boolean {
  return confirmingByDraft.has(draftId);
}

export function tryBeginConfirmTestDayDraft(draftId: string): boolean {
  // 推导步骤：确认闸与 in-flight 同步互斥，避免 React setState 晚于下一次提交
  if (countInflightTestDaySubmits(draftId) > 0) return false;
  if (confirmingByDraft.has(draftId)) return false;
  confirmingByDraft.add(draftId);
  if (countInflightTestDaySubmits(draftId) > 0) {
    confirmingByDraft.delete(draftId);
    return false;
  }
  return true;
}

export function endConfirmTestDayDraft(draftId: string): void {
  confirmingByDraft.delete(draftId);
}
