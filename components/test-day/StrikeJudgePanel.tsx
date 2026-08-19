"use client";

import { useRef, useState } from "react";
import type {
  PitchCall,
  StrikeJudgeCell,
  StrikeJudgeColumn,
} from "@/lib/gameArchive";
import {
  columnStrikeRate,
  isStrikeJudgeCorrect,
  judgeAccuracyRates,
  pitcherStrikeRates,
} from "@/lib/testDay/skillRates";

type MatrixSelection = { columnId: string; judgeId: string };

interface StrikeJudgePanelProps {
  judgePlayers: { id: string; name: string }[];
  pitcherPlayers: { id: string; name: string }[];
  columns: StrikeJudgeColumn[];
  cells: StrikeJudgeCell[];
  onAddColumn: (pitcherId: string, pitcherName: string) => void;
  onInitColumns: () => void;
  onReorderColumns: (fromIndex: number, toIndex: number) => void;
  onUpsertCell: (
    columnId: string,
    judgeId: string,
    judgeName: string,
    pitchCall: PitchCall,
    swung: boolean
  ) => void;
  onClearCell: (columnId: string, judgeId: string) => void;
  onRemoveColumn: (columnId: string) => void;
}

function cellSummary(cell: StrikeJudgeCell | undefined): string {
  if (!cell) return "";
  const call = cell.pitchCall === "strike" ? "好" : "坏";
  const swing = cell.swung ? "挥" : "放";
  const mark = isStrikeJudgeCorrect(cell.pitchCall, cell.swung) ? "✓" : "✗";
  return `${call}${swing}${mark}`;
}

export default function StrikeJudgePanel({
  judgePlayers,
  pitcherPlayers,
  columns,
  cells,
  onAddColumn,
  onInitColumns,
  onReorderColumns,
  onUpsertCell,
  onClearCell,
  onRemoveColumn,
}: StrikeJudgePanelProps) {
  const [selection, setSelection] = useState<MatrixSelection | null>(null);
  const dragFromIndex = useRef<number | null>(null);

  if (judgePlayers.length === 0 || pitcherPlayers.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-zinc-400">
        请先在左侧排阵勾选「好球判断」与「投手」
      </p>
    );
  }

  const sortedColumns = [...columns].sort(
    (a, b) => a.sortOrder - b.sortOrder
  );
  const judgeRates = judgeAccuracyRates(cells, judgePlayers);
  const pitcherRates = pitcherStrikeRates(columns, cells, pitcherPlayers);

  const findCell = (columnId: string, judgeId: string) =>
    cells.find(
      (cell) => cell.columnId === columnId && cell.judgeId === judgeId
    );

  const selectedCell = selection
    ? findCell(selection.columnId, selection.judgeId)
    : undefined;

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-2 text-xs text-zinc-600 md:grid-cols-2">
        <div>
          <p className="mb-1 font-medium text-zinc-800">判断正确率</p>
          <ul className="flex flex-col gap-0.5">
            {judgeRates.map((row) => (
              <li key={row.playerId}>
                {row.playerName}：{row.label}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="mb-1 font-medium text-zinc-800">投手好球率</p>
          <ul className="flex flex-col gap-0.5">
            {pitcherRates.map((row) => (
              <li key={row.playerId}>
                {row.playerName}：{row.label}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="overflow-x-auto border border-zinc-300">
        <table className="min-w-full border-collapse text-xs">
          <thead>
            <tr className="bg-zinc-100">
              <th className="sticky left-0 z-10 border border-zinc-300 bg-zinc-100 px-2 py-2 text-left">
                判断者
              </th>
              {sortedColumns.map((column, index) => (
                <th
                  key={column.id}
                  className="min-w-[4.5rem] border border-zinc-300 px-2 py-2 text-center"
                  onPointerDown={() => {
                    dragFromIndex.current = index;
                  }}
                  onPointerUp={() => {
                    if (dragFromIndex.current === null) return;
                    if (dragFromIndex.current !== index) {
                      onReorderColumns(dragFromIndex.current, index);
                    }
                    dragFromIndex.current = null;
                  }}
                >
                  <div className="font-bold text-zinc-900">
                    {column.pitcherName}
                  </div>
                  <div className="text-[10px] text-zinc-500">
                    好球率 {columnStrikeRate(column.id, cells)}
                  </div>
                  <div className="text-[10px] text-zinc-400">长按列头拖动</div>
                  <button
                    type="button"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!confirm("确认删除这一投手列及其判定格？")) return;
                      onRemoveColumn(column.id);
                    }}
                    className="mt-1 border border-red-300 px-1 py-0.5 text-[10px] font-normal text-red-600 hover:bg-red-50"
                  >
                    删除
                  </button>
                </th>
              ))}
              <th className="border border-zinc-300 px-2 py-2">
                <button
                  type="button"
                  onClick={() => {
                    const pitcher = pitcherPlayers[0];
                    if (!pitcher) return;
                    onAddColumn(pitcher.id, pitcher.name);
                  }}
                  className="flex h-8 w-8 items-center justify-center border border-zinc-400 text-lg leading-none hover:bg-zinc-100"
                  title="添加投手列"
                >
                  +
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {judgePlayers.map((judge) => (
              <tr key={judge.id}>
                <td className="sticky left-0 z-10 border border-zinc-300 bg-white px-2 py-2 font-medium text-zinc-900">
                  {judge.name}
                </td>
                {sortedColumns.map((column) => {
                  const disabled = judge.id === column.pitcherId;
                  const cell = findCell(column.id, judge.id);
                  const isSelected =
                    selection?.columnId === column.id &&
                    selection?.judgeId === judge.id;

                  return (
                    <td
                      key={`${column.id}-${judge.id}`}
                      className={`border border-zinc-300 px-1 py-1 text-center ${
                        disabled ? "bg-zinc-200 text-zinc-400" : "bg-white"
                      }`}
                    >
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() =>
                          setSelection({ columnId: column.id, judgeId: judge.id })
                        }
                        className={`min-h-8 w-full px-1 py-1 ${
                          isSelected
                            ? "ring-2 ring-zinc-900 ring-inset"
                            : "hover:bg-zinc-50"
                        }`}
                      >
                        {cell ? cellSummary(cell) : "·"}
                      </button>
                    </td>
                  );
                })}
                <td className="border border-zinc-300 bg-zinc-50" />
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selection && judgePlayers.some((j) => j.id === selection.judgeId) ? (
        <div className="flex flex-col gap-2 border border-zinc-300 bg-gray-50 p-3">
          <p className="text-xs text-zinc-600">
            已选格：{judgePlayers.find((j) => j.id === selection.judgeId)?.name}{" "}
            ×{" "}
            {
              sortedColumns.find((c) => c.id === selection.columnId)
                ?.pitcherName
            }
            {selectedCell ? `（当前 ${cellSummary(selectedCell)}）` : ""}
          </p>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["strike", true, "好球 + 挥棒"],
                ["strike", false, "好球 + 不挥"],
                ["ball", true, "坏球 + 挥棒"],
                ["ball", false, "坏球 + 不挥"],
              ] as const
            ).map(([pitchCall, swung, label]) => (
              <button
                key={label}
                type="button"
                onClick={() => {
                  const judge = judgePlayers.find(
                    (row) => row.id === selection.judgeId
                  );
                  if (!judge) return;
                  onUpsertCell(
                    selection.columnId,
                    selection.judgeId,
                    judge.name,
                    pitchCall,
                    swung
                  );
                }}
                className="border border-zinc-300 bg-white px-2 py-1 text-xs hover:bg-zinc-100"
              >
                {label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                if (!confirm("确认删除这一格？")) return;
                onClearCell(selection.columnId, selection.judgeId);
                setSelection(null);
              }}
              className="border border-red-300 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
            >
              删除
            </button>
          </div>
        </div>
      ) : null}

      {sortedColumns.length === 0 ? (
        <button
          type="button"
          onClick={onInitColumns}
          className="w-full border border-zinc-300 py-2 text-sm hover:bg-zinc-100"
        >
          按已勾投手初始化列
        </button>
      ) : (
        <div className="flex flex-wrap gap-2">
          {pitcherPlayers.map((pitcher) => (
            <button
              key={pitcher.id}
              type="button"
              onClick={() => onAddColumn(pitcher.id, pitcher.name)}
              className="border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-100"
            >
              + {pitcher.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
