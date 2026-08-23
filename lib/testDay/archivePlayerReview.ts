import type {
  FlyCatchAttempt,
  GameArchive,
  HitRecord,
  StrikeJudgeCell,
  ThrowPlay,
} from "@/lib/gameArchive";

export type ArchivePlayerSpeedLine = {
  columnName: string;
  seconds: number;
};

export type ArchivePlayerStrikeLine = {
  pitcherName: string;
  pitchCall: StrikeJudgeCell["pitchCall"];
  swung: boolean;
};

export type ArchivePlayerReview = {
  playerId: string;
  name: string;
  tests: string[];
  hits: HitRecord[];
  speedMarks: ArchivePlayerSpeedLine[];
  flyCatchAttempts: FlyCatchAttempt[];
  strikeCells: ArchivePlayerStrikeLine[];
  throwPlays: ThrowPlay[];
  notes: string[];
};

function displayName(
  playerId: string,
  fallback: string,
  playerNames: Record<string, string>
): string {
  return playerNames[playerId] || fallback || playerId;
}

function ensurePlayer(
  byId: Map<string, ArchivePlayerReview>,
  playerId: string,
  name: string,
  playerNames: Record<string, string>,
  assignments: Record<string, string[]>
): ArchivePlayerReview {
  const existing = byId.get(playerId);
  if (existing) return existing;
  const row: ArchivePlayerReview = {
    playerId,
    name: displayName(playerId, name, playerNames),
    tests: [...(assignments[playerId] ?? [])],
    hits: [],
    speedMarks: [],
    flyCatchAttempts: [],
    strikeCells: [],
    throwPlays: [],
    notes: [],
  };
  byId.set(playerId, row);
  return row;
}

/** 推导步骤：从排阵与各作成绩收集球员，再按姓名排序，供归档页逐人逐格展开 */
export function buildArchivePlayerReviews(
  archive: GameArchive,
  playerNames: Record<string, string>
): ArchivePlayerReview[] {
  const byId = new Map<string, ArchivePlayerReview>();
  const assignments = archive.assignments ?? {};

  for (const playerId of Object.keys(assignments)) {
    ensurePlayer(byId, playerId, "", playerNames, assignments);
  }

  for (const hit of archive.hits) {
    if (!hit.playerId) continue;
    ensurePlayer(byId, hit.playerId, hit.playerName, playerNames, assignments).hits.push(hit);
  }

  const columnName = new Map(
    archive.speedColumns.map((column) => [column.id, column.name])
  );
  for (const mark of archive.speedMarks) {
    if (!mark.playerId) continue;
    ensurePlayer(
      byId,
      mark.playerId,
      mark.playerName,
      playerNames,
      assignments
    ).speedMarks.push({
      columnName: columnName.get(mark.columnId) ?? mark.columnId,
      seconds: mark.seconds,
    });
  }

  for (const fly of archive.flyCatchAttempts) {
    if (!fly.playerId) continue;
    ensurePlayer(
      byId,
      fly.playerId,
      fly.playerName,
      playerNames,
      assignments
    ).flyCatchAttempts.push(fly);
  }

  const pitcherByColumn = new Map(
    archive.strikeJudgeColumns.map((column) => [column.id, column.pitcherName])
  );
  for (const cell of archive.strikeJudgeCells) {
    if (!cell.judgeId) continue;
    ensurePlayer(
      byId,
      cell.judgeId,
      cell.judgeName,
      playerNames,
      assignments
    ).strikeCells.push({
      pitcherName: pitcherByColumn.get(cell.columnId) ?? cell.columnId,
      pitchCall: cell.pitchCall,
      swung: cell.swung,
    });
  }

  for (const play of archive.throwPlays) {
    if (play.throwerId) {
      const row = ensurePlayer(
        byId,
        play.throwerId,
        play.throwerName,
        playerNames,
        assignments
      );
      if (!row.throwPlays.some((item) => item.id === play.id)) {
        row.throwPlays.push(play);
      }
    }
    if (play.firstBaseId && play.firstBaseId !== play.throwerId) {
      const row = ensurePlayer(
        byId,
        play.firstBaseId,
        play.firstBaseName,
        playerNames,
        assignments
      );
      if (!row.throwPlays.some((item) => item.id === play.id)) {
        row.throwPlays.push(play);
      }
    }
  }

  for (const note of archive.customPlayerNotes) {
    if (!note.playerId || !note.note.trim()) continue;
    ensurePlayer(
      byId,
      note.playerId,
      note.playerName,
      playerNames,
      assignments
    ).notes.push(`${note.testItem}：${note.note.trim()}`);
  }
  for (const note of archive.customGroupNotes) {
    if (!note.note.trim()) continue;
    const text = `${note.testItem}（${note.memberNames.join("、")}）：${note.note.trim()}`;
    for (const memberId of note.memberIds) {
      ensurePlayer(byId, memberId, "", playerNames, assignments).notes.push(text);
    }
  }

  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, "zh"));
}

export function archivePlayerLineCount(row: ArchivePlayerReview): number {
  return (
    row.hits.length +
    row.speedMarks.length +
    row.flyCatchAttempts.length +
    row.strikeCells.length +
    row.throwPlays.length +
    row.notes.length
  );
}
