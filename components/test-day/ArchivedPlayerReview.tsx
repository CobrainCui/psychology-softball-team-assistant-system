"use client";

import { HIT_RESULT_LABELS } from "@/components/test-day/hitLabels";
import type { HitResult } from "@/lib/gameArchive";
import {
  archivePlayerLineCount,
  type ArchivePlayerReview,
} from "@/lib/testDay/archivePlayerReview";

function hitLabel(result: string): string {
  return HIT_RESULT_LABELS[result as HitResult] ?? result;
}

function blameLabel(blame: string | undefined): string {
  if (blame === "thrower") return "传球人";
  if (blame === "firstBase") return "一垒";
  if (blame === "both") return "双方";
  return "";
}

export default function ArchivedPlayerReview({
  players,
}: {
  players: ArchivePlayerReview[];
}) {
  if (players.length === 0) {
    return <p className="mt-2 text-sm text-zinc-500">无逐人成绩。</p>;
  }

  return (
    <div className="mt-2 flex flex-col gap-2">
      {players.map((player) => {
        const lines = archivePlayerLineCount(player);
        return (
          <details key={player.playerId} className="border border-zinc-200 p-2">
            <summary className="cursor-pointer text-sm text-zinc-800">
              {player.name}
              {player.tests.length > 0 ? ` · ${player.tests.join("、")}` : ""}
              {` · ${lines} 格`}
            </summary>
            {lines === 0 ? (
              <p className="mt-2 text-xs text-zinc-500">该队员无成绩格。</p>
            ) : (
              <ul className="mt-2 flex flex-col gap-1 text-xs text-zinc-700">
                {player.hits.map((hit) => (
                  <li key={hit.id}>
                    打击 {hitLabel(hit.result)}
                    {hit.pitchType ? ` · ${hit.pitchType}` : ""}
                    {hit.hitQuality ? ` · ${hit.hitQuality}` : ""}
                  </li>
                ))}
                {player.speedMarks.map((mark, index) => (
                  <li key={`${player.playerId}-speed-${index}`}>
                    测速 {mark.columnName} {mark.seconds.toFixed(2)} 秒
                  </li>
                ))}
                {player.flyCatchAttempts.map((fly) => (
                  <li key={fly.id}>
                    接高飞 {fly.caught ? "接住" : "未接住"}
                    {fly.note ? ` · ${fly.note}` : ""}
                  </li>
                ))}
                {player.strikeCells.map((cell, index) => (
                  <li key={`${player.playerId}-strike-${index}`}>
                    好球判断 · 投手 {cell.pitcherName} ·{" "}
                    {cell.pitchCall === "strike" ? "好球" : "坏球"}
                    {cell.swung ? " · 挥棒" : ""}
                  </li>
                ))}
                {player.throwPlays.map((play) => (
                  <li key={play.id}>
                    {play.testItem} · {play.throwerName} → {play.firstBaseName} ·{" "}
                    {play.success ? "成功" : "失败"}
                    {!play.success && blameLabel(play.blame)
                      ? ` · 责任 ${blameLabel(play.blame)}`
                      : ""}
                  </li>
                ))}
                {player.notes.map((note, index) => (
                  <li key={`${player.playerId}-note-${index}`}>{note}</li>
                ))}
              </ul>
            )}
          </details>
        );
      })}
    </div>
  );
}
