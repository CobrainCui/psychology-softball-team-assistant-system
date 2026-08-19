"use client";

import { useState } from "react";
import type { ThrowBlame, ThrowPlay, ThrowTestItem } from "@/lib/gameArchive";
import {
  firstBaseSuccessRates,
  throwerSuccessRates,
} from "@/lib/testDay/skillRates";

type MatrixSelection = { throwerId: string; firstBaseId: string };

interface ThrowMatrixPanelProps {
  testItem: ThrowTestItem;
  throwerPlayers: { id: string; name: string }[];
  firstBasePlayers: { id: string; name: string }[];
  plays: ThrowPlay[];
  onUpsertPlay: (play: ThrowPlay) => void;
  onClearPlay: (
    testItem: ThrowTestItem,
    throwerId: string,
    firstBaseId: string
  ) => void;
}

function playSummary(play: ThrowPlay | undefined): string {
  if (!play) return "·";
  if (play.success) return "成";
  if (play.blame === "thrower") return "败·传";
  if (play.blame === "firstBase") return "败·垒";
  if (play.blame === "both") return "败·双方";
  return "败";
}

export default function ThrowMatrixPanel({
  testItem,
  throwerPlayers,
  firstBasePlayers,
  plays,
  onUpsertPlay,
  onClearPlay,
}: ThrowMatrixPanelProps) {
  const [selection, setSelection] = useState<MatrixSelection | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [pendingFailure, setPendingFailure] = useState(false);

  if (throwerPlayers.length === 0 || firstBasePlayers.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-zinc-400">
        请先在左侧排阵勾选「{testItem}」与「一垒」
      </p>
    );
  }

  const scopedPlays = plays.filter((play) => play.testItem === testItem);
  const throwerRates = throwerSuccessRates(scopedPlays, throwerPlayers);
  const firstBaseRates = firstBaseSuccessRates(scopedPlays, firstBasePlayers);

  const findPlay = (throwerId: string, firstBaseId: string) =>
    scopedPlays.find(
      (play) =>
        play.throwerId === throwerId && play.firstBaseId === firstBaseId
    );

  const selectedPlay = selection
    ? findPlay(selection.throwerId, selection.firstBaseId)
    : undefined;

  const selectedThrower = throwerPlayers.find(
    (player) => player.id === selection?.throwerId
  );
  const selectedFirstBase = firstBasePlayers.find(
    (player) => player.id === selection?.firstBaseId
  );

  const commitSuccess = (success: boolean, blame?: ThrowBlame) => {
    if (!selection || !selectedThrower || !selectedFirstBase) return;
    onUpsertPlay({
      id:
        selectedPlay?.id ??
        crypto.randomUUID(),
      testItem,
      throwerId: selectedThrower.id,
      throwerName: selectedThrower.name,
      firstBaseId: selectedFirstBase.id,
      firstBaseName: selectedFirstBase.name,
      success,
      blame: success ? undefined : blame,
      note: noteDraft.trim() || undefined,
      timestamp: Date.now(),
    });
    setPendingFailure(false);
    setNoteDraft(selectedPlay?.note ?? "");
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-2 text-xs text-zinc-600 md:grid-cols-2">
        <div>
          <p className="mb-1 font-medium text-zinc-800">传球手成功率</p>
          <ul className="flex flex-col gap-0.5">
            {throwerRates.map((row) => (
              <li key={row.playerId}>
                {row.playerName}：{row.label}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="mb-1 font-medium text-zinc-800">一垒手成功率</p>
          <ul className="flex flex-col gap-0.5">
            {firstBaseRates.map((row) => (
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
                传球手
              </th>
              {firstBasePlayers.map((firstBase) => (
                <th
                  key={firstBase.id}
                  className="min-w-[3.5rem] border border-zinc-300 px-2 py-2 text-center"
                >
                  {firstBase.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {throwerPlayers.map((thrower) => (
              <tr key={thrower.id}>
                <td className="sticky left-0 z-10 border border-zinc-300 bg-white px-2 py-2 font-medium text-zinc-900">
                  {thrower.name}
                </td>
                {firstBasePlayers.map((firstBase) => {
                  const disabled = thrower.id === firstBase.id;
                  const play = findPlay(thrower.id, firstBase.id);
                  const isSelected =
                    selection?.throwerId === thrower.id &&
                    selection?.firstBaseId === firstBase.id;

                  return (
                    <td
                      key={`${thrower.id}-${firstBase.id}`}
                      className={`border border-zinc-300 px-1 py-1 text-center ${
                        disabled ? "bg-zinc-200 text-zinc-400" : "bg-white"
                      }`}
                    >
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => {
                          setSelection({
                            throwerId: thrower.id,
                            firstBaseId: firstBase.id,
                          });
                          setNoteDraft(play?.note ?? "");
                          setPendingFailure(false);
                        }}
                        className={`min-h-8 w-full px-1 py-1 font-bold ${
                          isSelected
                            ? "ring-2 ring-zinc-900 ring-inset"
                            : "hover:bg-zinc-50"
                        }`}
                      >
                        {playSummary(play)}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selection && selectedThrower && selectedFirstBase ? (
        <div className="flex flex-col gap-2 border border-zinc-300 bg-gray-50 p-3">
          <p className="text-xs text-zinc-600">
            已选格：{selectedThrower.name} → {selectedFirstBase.name}
            {selectedPlay ? `（${playSummary(selectedPlay)}）` : ""}
          </p>
          <input
            type="text"
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
            placeholder="备注（选填）"
            className="w-full border border-zinc-300 bg-white px-2 py-1 text-sm"
          />
          {!pendingFailure ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => commitSuccess(true)}
                className="flex-1 border border-zinc-900 bg-zinc-900 py-2 text-sm text-white hover:bg-zinc-800"
              >
                成功
              </button>
              <button
                type="button"
                onClick={() => setPendingFailure(true)}
                className="flex-1 border border-zinc-300 py-2 text-sm hover:bg-zinc-100"
              >
                失败
              </button>
              <button
                type="button"
                onClick={() => {
                  onClearPlay(testItem, selection.throwerId, selection.firstBaseId);
                  setSelection(null);
                  setNoteDraft("");
                  setPendingFailure(false);
                }}
                className="border border-red-300 px-3 py-2 text-xs text-red-600 hover:bg-red-50"
              >
                清空
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <p className="text-xs text-zinc-600">失败责任归属：</p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => commitSuccess(false, "thrower")}
                  className="border border-zinc-300 bg-white px-2 py-1 text-xs hover:bg-zinc-100"
                >
                  传球手 · {selectedThrower.name}
                </button>
                <button
                  type="button"
                  onClick={() => commitSuccess(false, "firstBase")}
                  className="border border-zinc-300 bg-white px-2 py-1 text-xs hover:bg-zinc-100"
                >
                  一垒手 · {selectedFirstBase.name}
                </button>
                <button
                  type="button"
                  onClick={() => commitSuccess(false, "both")}
                  className="border border-zinc-300 bg-white px-2 py-1 text-xs hover:bg-zinc-100"
                >
                  双方有责
                </button>
                <button
                  type="button"
                  onClick={() => setPendingFailure(false)}
                  className="border border-zinc-300 px-2 py-1 text-xs text-zinc-500"
                >
                  返回
                </button>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
