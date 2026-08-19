// 测试清单技能项比率：只消费已填格；无样本显示 "—"。

import type {
  PitchCall,
  StrikeJudgeCell,
  StrikeJudgeColumn,
  ThrowBlame,
  ThrowPlay,
} from "@/lib/gameArchive";

export type RateRow = {
  playerId: string;
  playerName: string;
  filled: number;
  success: number;
  label: string;
};

// 推导步骤：好球且挥棒，或坏球且不挥 → 判断正确
export function isStrikeJudgeCorrect(
  pitchCall: PitchCall,
  swung: boolean
): boolean {
  return (
    (pitchCall === "strike" && swung) || (pitchCall === "ball" && !swung)
  );
}

export function formatRate(success: number, filled: number): string {
  if (filled <= 0) return "—";
  return `${Math.round((success / filled) * 100)}%`;
}

function toRateRow(
  playerId: string,
  playerName: string,
  success: number,
  filled: number
): RateRow {
  return {
    playerId,
    playerName,
    filled,
    success,
    label: formatRate(success, filled),
  };
}

// 推导步骤：按判断者聚合已填格 → 正确数 / 已填数
export function judgeAccuracyRates(
  cells: StrikeJudgeCell[],
  judges: { id: string; name: string }[]
): RateRow[] {
  return judges.map((judge) => {
    const filledCells = cells.filter((cell) => cell.judgeId === judge.id);
    const success = filledCells.filter((cell) =>
      isStrikeJudgeCorrect(cell.pitchCall, cell.swung)
    ).length;
    return toRateRow(judge.id, judge.name, success, filledCells.length);
  });
}

// 推导步骤：同一投手多列合并 → 好球数 / 已填数
export function pitcherStrikeRates(
  columns: StrikeJudgeColumn[],
  cells: StrikeJudgeCell[],
  pitchers: { id: string; name: string }[]
): RateRow[] {
  return pitchers.map((pitcher) => {
    const columnIds = new Set(
      columns
        .filter((column) => column.pitcherId === pitcher.id)
        .map((column) => column.id)
    );
    const filledCells = cells.filter((cell) => columnIds.has(cell.columnId));
    const strikes = filledCells.filter(
      (cell) => cell.pitchCall === "strike"
    ).length;
    return toRateRow(pitcher.id, pitcher.name, strikes, filledCells.length);
  });
}

export function columnStrikeRate(
  columnId: string,
  cells: StrikeJudgeCell[]
): string {
  const filledCells = cells.filter((cell) => cell.columnId === columnId);
  const strikes = filledCells.filter(
    (cell) => cell.pitchCall === "strike"
  ).length;
  return formatRate(strikes, filledCells.length);
}

// 推导步骤：成功，或失败且责任只在一垒 → 传球手计成功
export function throwerGetsCredit(
  success: boolean,
  blame: ThrowBlame | undefined
): boolean {
  if (success) return true;
  return blame === "firstBase";
}

// 推导步骤：成功，或失败且责任只在传球 → 一垒手计成功
export function firstBaseGetsCredit(
  success: boolean,
  blame: ThrowBlame | undefined
): boolean {
  if (success) return true;
  return blame === "thrower";
}

export function throwerSuccessRates(
  plays: ThrowPlay[],
  throwers: { id: string; name: string }[]
): RateRow[] {
  return throwers.map((thrower) => {
    const rowPlays = plays.filter((play) => play.throwerId === thrower.id);
    const success = rowPlays.filter((play) =>
      throwerGetsCredit(play.success, play.blame)
    ).length;
    return toRateRow(thrower.id, thrower.name, success, rowPlays.length);
  });
}

export function firstBaseSuccessRates(
  plays: ThrowPlay[],
  firstBases: { id: string; name: string }[]
): RateRow[] {
  return firstBases.map((firstBase) => {
    const colPlays = plays.filter((play) => play.firstBaseId === firstBase.id);
    const success = colPlays.filter((play) =>
      firstBaseGetsCredit(play.success, play.blame)
    ).length;
    return toRateRow(firstBase.id, firstBase.name, success, colPlays.length);
  });
}
