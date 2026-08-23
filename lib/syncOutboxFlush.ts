// 客户端刷新待同步：评估/训后读既有本机稿；测试日读 sync_outbox。
// 成功才删 pending；永久拒绝移入失败匣，禁止静默删除。

import {
  loadPendingReadinessHistory,
  markReadinessFailed,
  removeReadinessEntry,
  toReadinessCloudSaveInput,
} from "@/lib/readinessHistory";
import {
  deleteSessionFeedbackDraft,
  loadPendingSessionFeedbackDrafts,
  markSessionFeedbackFailed,
} from "@/lib/sessionFeedback";
import { saveReadinessAssessment } from "@/lib/status/readinessActions";
import { saveSessionFeedback } from "@/lib/status/feedbackActions";
import {
  submitTestDayEntry,
  tombstoneTestDayEntry,
} from "@/lib/testDay/entryActions";
import { getClientDeviceId } from "@/lib/testDay/clientDevice";
import type { DraftScope } from "@/lib/scopedStorage";
import {
  bumpSyncOutboxAttempt,
  isPermanentSyncReject,
  loadPendingSyncOutbox,
  markSyncOutboxFailed,
  removeSyncOutboxItem,
  type TestDayEntryOutboxPayload,
  type TestDayTombstoneOutboxPayload,
} from "@/lib/syncOutbox";

export type SyncFlushResult = {
  readinessSynced: string[];
  feedbackSynced: string[];
  testDaySynced: number;
  remaining: number;
  lastError: string | null;
};

let flushInFlight: Promise<SyncFlushResult> | null = null;

async function flushOnce(scope: DraftScope): Promise<SyncFlushResult> {
  const readinessSynced: string[] = [];
  const feedbackSynced: string[] = [];
  let testDaySynced = 0;
  let lastError: string | null = null;

  for (const entry of loadPendingReadinessHistory(scope)) {
    const res = await saveReadinessAssessment(toReadinessCloudSaveInput(entry));
    if (res.success) {
      removeReadinessEntry(scope, entry.playerId, entry.date);
      readinessSynced.push(entry.date);
      continue;
    }
    lastError = res.error;
    if (isPermanentSyncReject(res.error)) {
      markReadinessFailed(scope, entry.playerId, entry.date, res.error);
    }
  }

  for (const draft of loadPendingSessionFeedbackDrafts(scope)) {
    const res = await saveSessionFeedback({
      date: draft.date,
      activityTypes: draft.activityTypes,
      sessionRpe: draft.sessionRpe,
      note: draft.note,
      clientDraftId: draft.id,
    });
    if (res.success) {
      deleteSessionFeedbackDraft(scope, draft.id);
      feedbackSynced.push(draft.id);
      continue;
    }
    lastError = res.error;
    if (isPermanentSyncReject(res.error)) {
      markSessionFeedbackFailed(scope, draft.id, res.error);
    }
  }

  for (const item of loadPendingSyncOutbox(scope)) {
    if (item.kind === "test_day_entry") {
      const payload = item.payload as TestDayEntryOutboxPayload;
      const res = await submitTestDayEntry({
        draftId: payload.draftId,
        kind: payload.kind,
        payload: payload.payload,
        deviceId: payload.deviceId || getClientDeviceId(scope) || "",
      });
      if (res.success) {
        removeSyncOutboxItem(scope, item.dedupeKey);
        testDaySynced += 1;
        continue;
      }
      lastError = res.error;
      if (isPermanentSyncReject(res.error)) {
        markSyncOutboxFailed(scope, item.dedupeKey, res.error);
      } else {
        bumpSyncOutboxAttempt(scope, item.dedupeKey);
      }
      continue;
    }
    const payload = item.payload as TestDayTombstoneOutboxPayload;
    const res = await tombstoneTestDayEntry({
      draftId: payload.draftId,
      clientEntryId: payload.clientEntryId,
      deviceId: payload.deviceId || getClientDeviceId(scope) || "",
    });
    if (res.success) {
      removeSyncOutboxItem(scope, item.dedupeKey);
      testDaySynced += 1;
      continue;
    }
    lastError = res.error;
    if (isPermanentSyncReject(res.error)) {
      markSyncOutboxFailed(scope, item.dedupeKey, res.error);
    } else {
      bumpSyncOutboxAttempt(scope, item.dedupeKey);
    }
  }

  return {
    readinessSynced,
    feedbackSynced,
    testDaySynced,
    remaining:
      loadPendingReadinessHistory(scope).length +
      loadPendingSessionFeedbackDrafts(scope).length +
      loadPendingSyncOutbox(scope).length,
    lastError,
  };
}

export function countPendingSync(scope: DraftScope | null): number {
  if (!scope) return 0;
  return (
    loadPendingReadinessHistory(scope).length +
    loadPendingSessionFeedbackDrafts(scope).length +
    loadPendingSyncOutbox(scope).length
  );
}

export async function flushAccountSyncOutbox(
  scope: DraftScope | null
): Promise<SyncFlushResult> {
  if (!scope) {
    return {
      readinessSynced: [],
      feedbackSynced: [],
      testDaySynced: 0,
      remaining: 0,
      lastError: null,
    };
  }
  if (flushInFlight) return flushInFlight;
  flushInFlight = flushOnce(scope).finally(() => {
    flushInFlight = null;
  });
  return flushInFlight;
}
