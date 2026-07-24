"use client";

import type { Player } from "@/lib/players";
import type {
  HitQuality,
  HitRecord,
  HitResult,
  PitchType,
} from "@/lib/gameArchive";
import type { PendingHit } from "@/hooks/useTestDaySession";
import SoftballFieldSvg from "@/components/test-day/SoftballFieldSvg";
import {
  HIT_QUALITY_LABELS,
  HIT_QUALITY_OPTIONS,
  HIT_RESULT_LABELS,
  HIT_RESULTS,
  PITCH_TYPE_OPTIONS,
  PITCH_TYPE_SHORT_LABEL,
} from "@/components/test-day/hitLabels";

const TRAJECTORY_DOT_CLASSES = "h-2 w-2 rounded-full bg-black";

interface TeeBallPanelProps {
  players: Player[];
  currentBatterId: string;
  onBatterChange: (playerId: string) => void;
  currentResult: HitResult;
  onSelectResult: (result: HitResult) => void;
  plottableHits: HitRecord[];
  batterHits: HitRecord[];
  pendingHit: PendingHit | null;
  onFieldClick: (e: React.MouseEvent<HTMLDivElement>) => void;
  showPitchQualityPanel: boolean;
  currentPitchType: PitchType;
  onPitchTypeChange: (value: PitchType) => void;
  currentHitQuality: HitQuality;
  onHitQualityChange: (value: HitQuality) => void;
  isEntryPanelActive: boolean;
  onConfirmHit: () => void;
  onCancelHit: () => void;
  onUndo: () => void;
  onClearAll: () => void;
}

export default function TeeBallPanel({
  players,
  currentBatterId,
  onBatterChange,
  currentResult,
  onSelectResult,
  plottableHits,
  batterHits,
  pendingHit,
  onFieldClick,
  showPitchQualityPanel,
  currentPitchType,
  onPitchTypeChange,
  currentHitQuality,
  onHitQualityChange,
  isEntryPanelActive,
  onConfirmHit,
  onCancelHit,
  onUndo,
  onClearAll,
}: TeeBallPanelProps) {
  return (
    <div className="flex flex-col gap-4">
      <select
        value={currentBatterId}
        onChange={(e) => onBatterChange(e.target.value)}
        className="w-full border border-zinc-300 bg-white py-2 text-center text-sm text-zinc-900"
      >
        {players.map((player) => (
          <option key={player.id} value={player.id}>
            {player.name}
          </option>
        ))}
      </select>

      <div className="flex gap-1">
        {HIT_RESULTS.map((result) => (
          <button
            key={result}
            onClick={() => onSelectResult(result)}
            className={`flex-1 border py-1.5 text-xs transition-colors ${
              currentResult === result
                ? "border-zinc-900 bg-zinc-900 text-white"
                : "border-zinc-300 text-zinc-500 hover:bg-zinc-100"
            }`}
          >
            {HIT_RESULT_LABELS[result]}
          </button>
        ))}
      </div>

      <div
        onClick={onFieldClick}
        className="relative aspect-[1.4/1] w-full cursor-crosshair select-none border border-zinc-400 bg-zinc-100"
      >
        <SoftballFieldSvg />

        {plottableHits.map((hit) => (
          <span
            key={hit.id}
            className={`absolute -translate-x-1/2 -translate-y-1/2 ${TRAJECTORY_DOT_CLASSES}`}
            style={{ left: `${hit.x}%`, top: `${hit.y}%` }}
          />
        ))}

        {pendingHit && (
          <span
            className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 animate-pulse rounded-full bg-blue-500"
            style={{ left: `${pendingHit.x}%`, top: `${pendingHit.y}%` }}
          />
        )}
      </div>

      {showPitchQualityPanel && (
        <div className="flex flex-col gap-2 border border-zinc-300 bg-gray-50 p-3">
          <div className="flex flex-wrap gap-1">
            {PITCH_TYPE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => onPitchTypeChange(option.value)}
                className={`border px-2 py-1 text-sm transition-colors ${
                  currentPitchType === option.value
                    ? "border-zinc-900 bg-zinc-900 text-white"
                    : "border-zinc-300 text-zinc-500 hover:bg-zinc-100"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className="flex gap-1">
            {HIT_QUALITY_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => onHitQualityChange(option.value)}
                className={`flex-1 border px-2 py-1 text-sm transition-colors ${
                  currentHitQuality === option.value
                    ? "border-zinc-900 bg-zinc-900 text-white"
                    : "border-zinc-300 text-zinc-500 hover:bg-zinc-100"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={onConfirmHit}
          disabled={!isEntryPanelActive}
          className="flex-1 bg-black py-2 text-sm text-white transition-colors hover:bg-zinc-800 disabled:opacity-30"
        >
          ✅ 确认记录 | Confirm
        </button>
        <button
          onClick={onCancelHit}
          disabled={!pendingHit}
          className="flex-1 bg-gray-200 py-2 text-sm text-zinc-700 transition-colors hover:bg-gray-300 disabled:opacity-30"
        >
          ❌ 取消 | Cancel
        </button>
      </div>

      <div className="flex gap-2">
        <button
          onClick={onUndo}
          disabled={batterHits.length === 0}
          className="flex-1 border border-zinc-400 py-2 text-sm text-zinc-700 transition-colors hover:bg-zinc-100 disabled:opacity-30"
        >
          撤销上一步
        </button>
        <button
          onClick={onClearAll}
          disabled={batterHits.length === 0}
          className="flex-1 border border-red-300 py-2 text-sm text-red-600 transition-colors hover:bg-red-50 disabled:opacity-30"
        >
          清空全部
        </button>
      </div>

      <ul className="flex flex-col gap-1 text-xs text-zinc-500">
        {batterHits.map((hit, index) => {
          const pitchLabel = hit.pitchType
            ? (PITCH_TYPE_SHORT_LABEL[hit.pitchType as PitchType] ??
              hit.pitchType)
            : null;
          const qualityLabel = hit.hitQuality
            ? (HIT_QUALITY_LABELS[hit.hitQuality as HitQuality] ??
              hit.hitQuality)
            : null;
          const infoParts = [pitchLabel, qualityLabel].filter(Boolean);
          const infoText =
            infoParts.length > 0 ? ` (${infoParts.join(", ")})` : "";
          const coordText =
            hit.result === "MISS" ||
            hit.x === undefined ||
            hit.y === undefined
              ? ""
              : ` 坐标: X: ${hit.x.toFixed(1)}%, Y: ${hit.y.toFixed(1)}%`;

          return (
            <li key={hit.id}>
              #{index + 1} — [{HIT_RESULT_LABELS[hit.result]}]{infoText}
              {coordText}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
