import {
  submitTestDayEntry,
  tombstoneTestDayEntry,
} from "@/lib/testDay/entryActions";
import type { TestDayEntryKind } from "@/lib/testDay/collab/types";
import { validateEntryPayload } from "@/lib/testDay/collab/validatePayload";
import type { DraftScope } from "@/lib/scopedStorage";
import { getClientDeviceId } from "@/lib/testDay/clientDevice";
import {
  ARCHIVE_DEVICE_ID_REQUIRED_ERROR,
  ARCHIVE_INFLIGHT_ERROR,
} from "@/lib/testDay/collab/archiveReady";
import {
  isPermanentSyncReject,
  PENDING_SYNC_COPY,
  removeSyncOutboxItem,
  testDayEntryDedupeKey,
  testDayTombstoneDedupeKey,
  upsertSyncOutboxItem,
} from "@/lib/syncOutbox";
import {
  beginInflightTestDaySubmit,
  countInflightTestDaySubmits,
  endConfirmTestDayDraft,
  endInflightTestDaySubmit,
  isConfirmingTestDayDraft,
  tryBeginConfirmTestDayDraft,
} from "@/lib/testDay/collab/confirmGate";

export {
  countInflightTestDaySubmits,
  endConfirmTestDayDraft,
  isConfirmingTestDayDraft,
  tryBeginConfirmTestDayDraft,
};

export function reportActionFail(
  error: string,
  onNotice: (message: string) => void
): false {
  console.error("云端被拒:", error);
  onNotice(error);
  return false;
}

export async function submitCloudEntry(input: {
  draftId: string;
  kind: TestDayEntryKind;
  payload: unknown;
  onNotice: (message: string) => void;
  scope: DraftScope | null;
}): Promise<boolean> {
  const parsed = validateEntryPayload(input.kind, input.payload);
  const deviceId = getClientDeviceId(input.scope);
  if (!deviceId) {
    return reportActionFail(ARCHIVE_DEVICE_ID_REQUIRED_ERROR, input.onNotice);
  }
  if (isConfirmingTestDayDraft(input.draftId)) {
    if (parsed.ok) {
      upsertSyncOutboxItem(input.scope, {
        kind: "test_day_entry",
        dedupeKey: testDayEntryDedupeKey(input.draftId, parsed.clientEntryId),
        payload: {
          draftId: input.draftId,
          kind: input.kind,
          payload: input.payload,
          deviceId,
        },
      });
      input.onNotice(PENDING_SYNC_COPY);
      return true;
    }
    return reportActionFail(ARCHIVE_INFLIGHT_ERROR, input.onNotice);
  }
  beginInflightTestDaySubmit(input.draftId);
  try {
    const res = await submitTestDayEntry({ ...input, deviceId });
    if (!res.success) {
      if (parsed.ok && !isPermanentSyncReject(res.error)) {
        upsertSyncOutboxItem(input.scope, {
          kind: "test_day_entry",
          dedupeKey: testDayEntryDedupeKey(input.draftId, parsed.clientEntryId),
          payload: {
            draftId: input.draftId,
            kind: input.kind,
            payload: input.payload,
            deviceId,
          },
        });
        input.onNotice(PENDING_SYNC_COPY);
        console.error("云端被拒:", res.error);
        // 推导步骤：已入待同步队列，走本地成功路径以便盘面投影
        return true;
      }
      return reportActionFail(res.error, input.onNotice);
    }
    if (parsed.ok) {
      removeSyncOutboxItem(
        input.scope,
        testDayEntryDedupeKey(input.draftId, parsed.clientEntryId)
      );
    }
    if (res.conflicted) {
      input.onNotice("该格与他人记录冲突，待队长或教练裁决后才会写入盘面。");
    }
    return true;
  } finally {
    endInflightTestDaySubmit(input.draftId);
  }
}

export async function tombstoneCloudEntry(input: {
  draftId: string;
  clientEntryId: string;
  onNotice: (message: string) => void;
  scope: DraftScope | null;
}): Promise<boolean> {
  const deviceId = getClientDeviceId(input.scope);
  if (!deviceId) {
    return reportActionFail(ARCHIVE_DEVICE_ID_REQUIRED_ERROR, input.onNotice);
  }
  if (isConfirmingTestDayDraft(input.draftId)) {
    upsertSyncOutboxItem(input.scope, {
      kind: "test_day_tombstone",
      dedupeKey: testDayTombstoneDedupeKey(
        input.draftId,
        input.clientEntryId
      ),
      payload: {
        draftId: input.draftId,
        clientEntryId: input.clientEntryId,
        deviceId,
      },
    });
    input.onNotice(PENDING_SYNC_COPY);
    return true;
  }
  beginInflightTestDaySubmit(input.draftId);
  try {
    const res = await tombstoneTestDayEntry({ ...input, deviceId });
    if (!res.success) {
      if (!isPermanentSyncReject(res.error)) {
        upsertSyncOutboxItem(input.scope, {
          kind: "test_day_tombstone",
          dedupeKey: testDayTombstoneDedupeKey(
            input.draftId,
            input.clientEntryId
          ),
          payload: {
            draftId: input.draftId,
            clientEntryId: input.clientEntryId,
            deviceId,
          },
        });
        input.onNotice(PENDING_SYNC_COPY);
        console.error("云端被拒:", res.error);
        return true;
      }
      return reportActionFail(res.error, input.onNotice);
    }
    removeSyncOutboxItem(
      input.scope,
      testDayTombstoneDedupeKey(input.draftId, input.clientEntryId)
    );
    return true;
  } finally {
    endInflightTestDaySubmit(input.draftId);
  }
}
