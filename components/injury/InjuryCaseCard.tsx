"use client";

import type { InjuryCaseDto } from "@/lib/statusActions";
import { INJURY_KIND_LABEL, painScoreText } from "@/lib/clinical/injuryKinds";

export function InjuryCaseCard({
  item,
  onPain,
  onNote,
  onRecover,
  onRelapse,
}: {
  item: InjuryCaseDto;
  onPain: (c: InjuryCaseDto) => void;
  onNote: (c: InjuryCaseDto, kind: "treatment" | "rehab") => void;
  onRecover: (c: InjuryCaseDto) => void;
  onRelapse: (c: InjuryCaseDto) => void;
}) {
  const latest = item.latestPain;
  return (
    <article className="flex flex-col gap-2 border border-zinc-200 bg-white p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-medium">
          {item.painAreaLabel}
          {item.locationHint ? ` · ${item.locationHint}` : ""}
        </h3>
        <span className="font-mono text-xs text-zinc-500">
          {item.status === "active" ? "关注中" : "已康复"}
        </span>
      </div>
      <p className="text-xs text-zinc-500">
        {INJURY_KIND_LABEL[item.injuryKind]} · 起于 {item.startDate}
        {item.recoveredAt ? ` · 康复 ${item.recoveredAt}` : ""}
      </p>
      <p className="text-sm text-zinc-700">
        {item.trend.label}
        {latest != null ? ` · 最近 ${painScoreText(latest)}` : ""}
      </p>
      {item.trend.series.length >= 2 && (
        <div className="flex h-12 items-end gap-0.5">
          {item.trend.series.map((p) => (
            <div
              key={p.date}
              className="flex-1 bg-zinc-900"
              style={{ height: `${(p.score / 10) * 100}%` }}
              title={`${p.date} ${p.score}`}
            />
          ))}
        </div>
      )}
      <p className="whitespace-pre-line text-xs leading-relaxed text-zinc-500">
        {item.trend.narrative}
      </p>
      {item.status === "active" ? (
        <div className="flex flex-wrap gap-1">
          <button
            type="button"
            onClick={() => onPain(item)}
            className="border border-zinc-900 bg-zinc-900 px-2 py-1 text-xs text-white"
          >
            今日疼痛
          </button>
          <button
            type="button"
            onClick={() => onNote(item, "treatment")}
            className="border border-zinc-300 px-2 py-1 text-xs"
          >
            诊疗备注
          </button>
          <button
            type="button"
            onClick={() => onNote(item, "rehab")}
            className="border border-zinc-300 px-2 py-1 text-xs"
          >
            康复备注
          </button>
          <button
            type="button"
            onClick={() => onRecover(item)}
            className="border border-zinc-300 px-2 py-1 text-xs text-zinc-500"
          >
            标为已康复
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => onRelapse(item)}
          className="self-start border border-zinc-300 px-2 py-1 text-xs"
        >
          复发，新建关注
        </button>
      )}
    </article>
  );
}
