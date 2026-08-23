import type { Player } from "@/lib/players";
import type { PitchCall, ThrowPlay, ThrowTestItem } from "@/lib/gameArchive";
import type { useTestDayHits } from "@/hooks/useTestDayHits";
import type { useTestDaySkillRecords } from "@/hooks/useTestDaySkillRecords";
import {
  submitCloudEntry,
  tombstoneCloudEntry,
} from "@/hooks/cloudTestDaySubmit";
import { parseSpeedSeconds } from "@/lib/testDay/speedGrid";

type Hits = ReturnType<typeof useTestDayHits>;
type Skills = ReturnType<typeof useTestDaySkillRecords>;

export function createCloudScoreHandlers(input: {
  draftId: string;
  canSubmit: boolean;
  refresh: () => Promise<boolean>;
  hits: Hits;
  skills: Skills;
  currentBatterId: string;
  currentBatter: Player | undefined;
  setCurrentBatterId: (id: string) => void;
}) {
  const {
    draftId,
    canSubmit,
    refresh,
    hits,
    skills,
    currentBatterId,
    currentBatter,
    setCurrentBatterId,
  } = input;

  const handleConfirmHit = () => {
    if (!canSubmit || !currentBatter || !hits.isEntryPanelActive) return;
    const nextHit = {
      id: hits.editingHitId ?? crypto.randomUUID(),
      ...(hits.pendingHit ? { x: hits.pendingHit.x, y: hits.pendingHit.y } : {}),
      result: hits.currentResult,
      playerId: currentBatter.id,
      playerName: currentBatter.name,
      ...(hits.currentResult !== "MISS"
        ? {
            pitchType: hits.currentPitchType,
            hitQuality: hits.currentHitQuality,
          }
        : {}),
      timestamp: Date.now(),
    };
    void (async () => {
      if (hits.editingHitId) {
        const ok = await tombstoneCloudEntry({
          draftId,
          clientEntryId: hits.editingHitId,
        });
        if (!ok) return;
        nextHit.id = crypto.randomUUID();
      }
      const ok = await submitCloudEntry({
        draftId,
        kind: "hit",
        payload: nextHit,
      });
      if (!ok) return;
      hits.handleCancelHit();
      await refresh();
    })();
  };

  const handleDeleteHit = (hitId: string) => {
    if (!canSubmit) return;
    void (async () => {
      const ok = await tombstoneCloudEntry({ draftId, clientEntryId: hitId });
      if (ok) await refresh();
    })();
  };

  const handleUndo = () => {
    const last = [...hits.hits]
      .reverse()
      .find((hit) => hit.playerId === currentBatterId);
    if (!last) return;
    handleDeleteHit(last.id);
  };

  const handleClearAll = () => {
    if (!currentBatter) return;
    if (
      !confirm(
        `确认清空「${currentBatter.name}」的全部打击记录？此操作不可撤销。`
      )
    ) {
      return;
    }
    const ids = hits.hits
      .filter((hit) => hit.playerId === currentBatterId)
      .map((hit) => hit.id);
    void (async () => {
      for (const id of ids) {
        const ok = await tombstoneCloudEntry({ draftId, clientEntryId: id });
        if (!ok) return;
      }
      await refresh();
    })();
  };

  const handleBeginEditHit = (hitId: string) => {
    const playerId = hits.handleBeginEditHit(hitId);
    if (playerId) setCurrentBatterId(playerId);
  };

  const handleSpeedMarkChange = (
    playerId: string,
    playerName: string,
    columnId: string,
    raw: string
  ) => {
    if (!canSubmit) return;
    const seconds = parseSpeedSeconds(raw);
    const existing = skills.speedMarks.find(
      (mark) => mark.playerId === playerId && mark.columnId === columnId
    );
    void (async () => {
      if (seconds === null) {
        if (existing) {
          await tombstoneCloudEntry({
            draftId,
            clientEntryId: existing.id,
          });
          await refresh();
        }
        return;
      }
      if (existing) {
        const ok = await tombstoneCloudEntry({
          draftId,
          clientEntryId: existing.id,
        });
        if (!ok) return;
      }
      await submitCloudEntry({
        draftId,
        kind: "speed_mark",
        payload: {
          id: crypto.randomUUID(),
          playerId,
          playerName,
          columnId,
          seconds,
          timestamp: Date.now(),
        },
      });
      await refresh();
    })();
  };

  const handleRecordFlyCatch = (
    playerId: string,
    playerName: string,
    caught: boolean
  ) => {
    if (!canSubmit) return;
    const note = skills.flyCatchNoteDrafts[playerId]?.trim();
    const editing = skills.editingFlyCatchId
      ? skills.flyCatchAttempts.find((row) => row.id === skills.editingFlyCatchId)
      : undefined;
    void (async () => {
      if (editing && editing.playerId === playerId) {
        const ok = await tombstoneCloudEntry({
          draftId,
          clientEntryId: editing.id,
        });
        if (!ok) return;
      }
      await submitCloudEntry({
        draftId,
        kind: "fly_catch",
        payload: {
          id: crypto.randomUUID(),
          playerId,
          playerName,
          caught,
          note: note || undefined,
          timestamp: Date.now(),
        },
      });
      await refresh();
    })();
  };

  const handleDeleteFlyCatch = (attemptId: string) => {
    if (!canSubmit) return;
    void (async () => {
      const ok = await tombstoneCloudEntry({
        draftId,
        clientEntryId: attemptId,
      });
      if (ok) await refresh();
    })();
  };

  const handleUndoFlyCatch = (playerId: string) => {
    const last = [...skills.flyCatchAttempts]
      .reverse()
      .find((row) => row.playerId === playerId);
    if (!last) return;
    handleDeleteFlyCatch(last.id);
  };

  const handleUpsertStrikeJudgeCell = (
    columnId: string,
    judgeId: string,
    judgeName: string,
    pitchCall: PitchCall,
    swung: boolean
  ) => {
    if (!canSubmit) return;
    const existing = skills.strikeJudgeCells.find(
      (cell) => cell.columnId === columnId && cell.judgeId === judgeId
    );
    void (async () => {
      if (existing) {
        const ok = await tombstoneCloudEntry({
          draftId,
          clientEntryId: `${existing.columnId}:${existing.judgeId}:${existing.timestamp}`,
        });
        if (!ok) return;
      }
      await submitCloudEntry({
        draftId,
        kind: "strike_cell",
        payload: {
          columnId,
          judgeId,
          judgeName,
          pitchCall,
          swung,
          timestamp: Date.now(),
        },
      });
      await refresh();
    })();
  };

  const handleClearStrikeJudgeCell = (columnId: string, judgeId: string) => {
    if (!canSubmit) return;
    const existing = skills.strikeJudgeCells.find(
      (cell) => cell.columnId === columnId && cell.judgeId === judgeId
    );
    if (!existing) return;
    void (async () => {
      const ok = await tombstoneCloudEntry({
        draftId,
        clientEntryId: `${existing.columnId}:${existing.judgeId}:${existing.timestamp}`,
      });
      if (ok) await refresh();
    })();
  };

  const handleUpsertThrowPlay = (play: ThrowPlay) => {
    if (!canSubmit) return;
    const existing = skills.throwPlays.find(
      (row) =>
        row.testItem === play.testItem &&
        row.throwerId === play.throwerId &&
        row.firstBaseId === play.firstBaseId
    );
    void (async () => {
      if (existing) {
        const ok = await tombstoneCloudEntry({
          draftId,
          clientEntryId: existing.id,
        });
        if (!ok) return;
      }
      await submitCloudEntry({
        draftId,
        kind: "throw_play",
        payload: { ...play, id: crypto.randomUUID(), timestamp: Date.now() },
      });
      await refresh();
    })();
  };

  const handleClearThrowPlay = (
    testItem: ThrowTestItem,
    throwerId: string,
    firstBaseId: string
  ) => {
    if (!canSubmit) return;
    const existing = skills.throwPlays.find(
      (play) =>
        play.testItem === testItem &&
        play.throwerId === throwerId &&
        play.firstBaseId === firstBaseId
    );
    if (!existing) return;
    void (async () => {
      const ok = await tombstoneCloudEntry({
        draftId,
        clientEntryId: existing.id,
      });
      if (ok) await refresh();
    })();
  };

  return {
    handleConfirmHit,
    handleDeleteHit,
    handleUndo,
    handleClearAll,
    handleBeginEditHit,
    handleSpeedMarkChange,
    handleRecordFlyCatch,
    handleDeleteFlyCatch,
    handleUndoFlyCatch,
    handleUpsertStrikeJudgeCell,
    handleClearStrikeJudgeCell,
    handleUpsertThrowPlay,
    handleClearThrowPlay,
  };
}
