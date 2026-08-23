"use client";

import type { CoachPlotPoint } from "@/lib/status/coachActions";

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function toPct(value: number): number {
  return ((clamp(value, 1, 5) - 1) / 4) * 100;
}

function initials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  return trimmed.slice(0, 2);
}

export function TeamQuadrantChart({ points }: { points: CoachPlotPoint[] }) {
  return (
    <div
      data-testid="team-quadrant-chart"
      className="relative aspect-square w-full border border-zinc-900 bg-white"
    >
      <div className="absolute inset-0 grid grid-cols-2 grid-rows-2">
        <div className="border-r border-b border-zinc-200 bg-zinc-50/60" />
        <div className="border-b border-zinc-200" />
        <div className="border-r border-zinc-200 bg-zinc-50/40" />
        <div />
      </div>
      <span className="absolute left-2 top-2 text-xs text-zinc-400">
        想动但电量低
      </span>
      <span className="absolute right-2 top-2 text-xs text-zinc-400">
        在线
      </span>
      <span className="absolute bottom-6 left-2 text-xs text-zinc-400">
        身心都紧
      </span>
      <span className="absolute bottom-6 right-2 text-xs text-zinc-400">
        身体好但不想动
      </span>
      {points.map((p) => (
        <div
          key={p.playerId}
          className="absolute -translate-x-1/2 translate-y-1/2"
          style={{
            left: `${toPct(p.physicalBattery)}%`,
            bottom: `${toPct(p.mentalDrive)}%`,
          }}
          title={`${p.playerName} · ${p.quadrantLabel}`}
        >
          <span className="flex h-7 min-w-7 items-center justify-center rounded-full border border-zinc-900 bg-white px-1.5 text-xs font-medium">
            {initials(p.playerName)}
          </span>
        </div>
      ))}
      <span className="absolute bottom-1 left-1/2 -translate-x-1/2 text-xs uppercase text-zinc-400">
        身体电量 →
      </span>
    </div>
  );
}
