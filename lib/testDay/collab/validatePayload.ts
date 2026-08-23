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
import { entityKeyForKind } from "@/lib/testDay/collab/entityKeys";
import type { TestDayEntryKind } from "@/lib/testDay/collab/types";

export function validateEntryPayload(
  kind: TestDayEntryKind,
  payload: unknown
):
  | { ok: true; entityKey: string; clientEntryId: string }
  | { ok: false; error: string } {
  switch (kind) {
    case "hit": {
      if (!isHitRecord(payload)) return { ok: false, error: "打击记录无效" };
      const entityKey = entityKeyForKind(kind, { clientEntryId: payload.id });
      if (!entityKey) return { ok: false, error: "entityKey 无效" };
      return { ok: true, entityKey, clientEntryId: payload.id };
    }
    case "fly_catch": {
      if (!isFlyCatchAttempt(payload)) {
        return { ok: false, error: "接高飞记录无效" };
      }
      const entityKey = entityKeyForKind(kind, { clientEntryId: payload.id });
      if (!entityKey) return { ok: false, error: "entityKey 无效" };
      return { ok: true, entityKey, clientEntryId: payload.id };
    }
    case "speed_mark": {
      if (!isSpeedMark(payload)) return { ok: false, error: "测速格无效" };
      const entityKey = entityKeyForKind(kind, {
        clientEntryId: payload.id,
        playerId: payload.playerId,
        columnId: payload.columnId,
      });
      if (!entityKey) return { ok: false, error: "entityKey 无效" };
      return { ok: true, entityKey, clientEntryId: payload.id };
    }
    case "strike_cell": {
      if (!isStrikeJudgeCell(payload)) return { ok: false, error: "好球格无效" };
      const clientEntryId = `${payload.columnId}:${payload.judgeId}:${payload.timestamp}`;
      const entityKey = entityKeyForKind(kind, {
        clientEntryId,
        columnId: payload.columnId,
        judgeId: payload.judgeId,
      });
      if (!entityKey) return { ok: false, error: "entityKey 无效" };
      return { ok: true, entityKey, clientEntryId };
    }
    case "throw_play": {
      if (!isThrowPlay(payload)) return { ok: false, error: "传球记录无效" };
      const entityKey = entityKeyForKind(kind, {
        clientEntryId: payload.id,
        testItem: payload.testItem,
        throwerId: payload.throwerId,
        firstBaseId: payload.firstBaseId,
      });
      if (!entityKey) return { ok: false, error: "entityKey 无效" };
      return { ok: true, entityKey, clientEntryId: payload.id };
    }
    case "custom_player_note": {
      if (!isCustomPlayerNote(payload)) return { ok: false, error: "备注无效" };
      const entityKey = entityKeyForKind(kind, {
        clientEntryId: payload.id,
        testItem: payload.testItem,
        playerId: payload.playerId,
      });
      if (!entityKey) return { ok: false, error: "entityKey 无效" };
      return { ok: true, entityKey, clientEntryId: payload.id };
    }
    case "custom_group_note": {
      if (!isCustomGroupNote(payload)) return { ok: false, error: "分组备注无效" };
      const entityKey = entityKeyForKind(kind, {
        clientEntryId: payload.id,
        testItem: payload.testItem,
        noteScope: payload.id,
      });
      if (!entityKey) return { ok: false, error: "entityKey 无效" };
      return { ok: true, entityKey, clientEntryId: payload.id };
    }
    case "custom_single_note": {
      if (!isCustomSingleNote(payload)) {
        return { ok: false, error: "整项备注无效" };
      }
      const entityKey = entityKeyForKind(kind, {
        clientEntryId: payload.id,
        testItem: payload.testItem,
      });
      if (!entityKey) return { ok: false, error: "entityKey 无效" };
      return { ok: true, entityKey, clientEntryId: payload.id };
    }
    default:
      return { ok: false, error: "未知记录类型" };
  }
}
