import {
  submitTestDayEntry,
  tombstoneTestDayEntry,
} from "@/lib/testDay/entryActions";
import type { TestDayEntryKind } from "@/lib/testDay/collab/types";

export function reportActionFail(error: string): false {
  console.error("云端被拒:", error);
  window.alert(error);
  return false;
}

export async function submitCloudEntry(input: {
  draftId: string;
  kind: TestDayEntryKind;
  payload: unknown;
}): Promise<boolean> {
  const res = await submitTestDayEntry(input);
  if (!res.success) return reportActionFail(res.error);
  if (res.conflicted) {
    window.alert("该格与他人记录冲突，待队长或教练裁决后才会写入盘面。");
  }
  return true;
}

export async function tombstoneCloudEntry(input: {
  draftId: string;
  clientEntryId: string;
}): Promise<boolean> {
  const res = await tombstoneTestDayEntry(input);
  if (!res.success) return reportActionFail(res.error);
  return true;
}
