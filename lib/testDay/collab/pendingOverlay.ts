// 推导步骤：本机待同步 Entry/tombstone 叠到云端快照上，只标识本设备未上云的格。
// 失败匣项目不再投影，避免把已归档拒绝的成绩画回盘面。

import {
  isFlyCatchAttempt,
  isHitRecord,
  isSpeedMark,
  isStrikeJudgeCell,
  isThrowPlay,
} from "@/lib/gameArchive";
import {
  isCustomGroupNote,
  isCustomPlayerNote,
  isCustomSingleNote,
} from "@/lib/testDay/customTests";
import type { DraftBoardSnapshot } from "@/lib/testDay/collab/projectSnapshot";
import { validateEntryPayload } from "@/lib/testDay/collab/validatePayload";
import {
  outboxItemDraftId,
  type SyncOutboxItem,
  type TestDayEntryOutboxPayload,
  type TestDayTombstoneOutboxPayload,
} from "@/lib/syncOutbox";

function removeById<T extends { id: string }>(
  rows: T[],
  clientEntryId: string
): T[] {
  return rows.filter((row) => row.id !== clientEntryId);
}

function overlayTombstone(
  snapshot: DraftBoardSnapshot,
  clientEntryId: string
): DraftBoardSnapshot {
  return {
    ...snapshot,
    hits: removeById(snapshot.hits, clientEntryId),
    speedMarks: removeById(snapshot.speedMarks, clientEntryId),
    flyCatchAttempts: removeById(snapshot.flyCatchAttempts, clientEntryId),
    throwPlays: removeById(snapshot.throwPlays, clientEntryId),
    customPlayerNotes: removeById(snapshot.customPlayerNotes, clientEntryId),
    customGroupNotes: snapshot.customGroupNotes.filter(
      (row) => row.id !== clientEntryId && row.revisionId !== clientEntryId
    ),
    customSingleNotes: removeById(snapshot.customSingleNotes, clientEntryId),
    strikeJudgeCells: snapshot.strikeJudgeCells.filter((row) => {
      const id = `${row.columnId}:${row.judgeId}:${row.timestamp}`;
      return id !== clientEntryId;
    }),
  };
}

function overlayEntry(
  snapshot: DraftBoardSnapshot,
  item: SyncOutboxItem
): { snapshot: DraftBoardSnapshot; clientEntryId: string | null } {
  const payload = item.payload as TestDayEntryOutboxPayload;
  const parsed = validateEntryPayload(payload.kind, payload.payload);
  if (!parsed.ok) return { snapshot, clientEntryId: null };
  const body = payload.payload;

  if (payload.kind === "hit" && isHitRecord(body)) {
    return {
      snapshot: {
        ...snapshot,
        hits: [...removeById(snapshot.hits, parsed.clientEntryId), body],
      },
      clientEntryId: parsed.clientEntryId,
    };
  }
  if (payload.kind === "fly_catch" && isFlyCatchAttempt(body)) {
    return {
      snapshot: {
        ...snapshot,
        flyCatchAttempts: [
          ...removeById(snapshot.flyCatchAttempts, parsed.clientEntryId),
          body,
        ],
      },
      clientEntryId: parsed.clientEntryId,
    };
  }
  if (payload.kind === "speed_mark" && isSpeedMark(body)) {
    return {
      snapshot: {
        ...snapshot,
        speedMarks: [
          ...snapshot.speedMarks.filter(
            (row) =>
              !(row.playerId === body.playerId && row.columnId === body.columnId)
          ),
          body,
        ],
      },
      clientEntryId: parsed.clientEntryId,
    };
  }
  if (payload.kind === "strike_cell" && isStrikeJudgeCell(body)) {
    return {
      snapshot: {
        ...snapshot,
        strikeJudgeCells: [
          ...snapshot.strikeJudgeCells.filter(
            (row) =>
              !(row.columnId === body.columnId && row.judgeId === body.judgeId)
          ),
          body,
        ],
      },
      clientEntryId: parsed.clientEntryId,
    };
  }
  if (payload.kind === "throw_play" && isThrowPlay(body)) {
    return {
      snapshot: {
        ...snapshot,
        throwPlays: [
          ...snapshot.throwPlays.filter(
            (row) =>
              !(
                row.testItem === body.testItem &&
                row.throwerId === body.throwerId &&
                row.firstBaseId === body.firstBaseId
              )
          ),
          body,
        ],
      },
      clientEntryId: parsed.clientEntryId,
    };
  }
  if (payload.kind === "custom_player_note" && isCustomPlayerNote(body)) {
    return {
      snapshot: {
        ...snapshot,
        customPlayerNotes: [
          ...snapshot.customPlayerNotes.filter(
            (row) =>
              !(row.testItem === body.testItem && row.playerId === body.playerId)
          ),
          body,
        ],
      },
      clientEntryId: parsed.clientEntryId,
    };
  }
  if (payload.kind === "custom_group_note" && isCustomGroupNote(body)) {
    return {
      snapshot: {
        ...snapshot,
        customGroupNotes: [
          ...snapshot.customGroupNotes.filter((row) => row.id !== body.id),
          body,
        ],
      },
      clientEntryId: parsed.clientEntryId,
    };
  }
  if (payload.kind === "custom_single_note" && isCustomSingleNote(body)) {
    return {
      snapshot: {
        ...snapshot,
        customSingleNotes: [
          ...snapshot.customSingleNotes.filter(
            (row) => row.testItem !== body.testItem
          ),
          body,
        ],
      },
      clientEntryId: parsed.clientEntryId,
    };
  }
  return { snapshot, clientEntryId: null };
}

export function overlayPendingOnSnapshot(
  snapshot: DraftBoardSnapshot,
  items: SyncOutboxItem[],
  draftId: string
): { snapshot: DraftBoardSnapshot; pendingIds: string[] } {
  const pendingIds: string[] = [];
  let next = snapshot;
  const ordered = [...items]
    .filter(
      (row) => row.status === "pending" && outboxItemDraftId(row) === draftId
    )
    .sort((a, b) => a.createdAt - b.createdAt);
  for (const item of ordered) {
    if (item.kind === "test_day_tombstone") {
      const payload = item.payload as TestDayTombstoneOutboxPayload;
      next = overlayTombstone(next, payload.clientEntryId);
      pendingIds.push(payload.clientEntryId);
      continue;
    }
    const applied = overlayEntry(next, item);
    next = applied.snapshot;
    if (applied.clientEntryId) pendingIds.push(applied.clientEntryId);
  }
  return { snapshot: next, pendingIds };
}
