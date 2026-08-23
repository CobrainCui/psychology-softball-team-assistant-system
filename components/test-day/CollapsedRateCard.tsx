"use client";

import { useState } from "react";
import type { RateRow } from "@/lib/testDay/skillRates";

export default function CollapsedRateCard({
  title,
  rows,
}: {
  title: string;
  rows: RateRow[];
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border border-zinc-200 bg-white">
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((prev) => !prev)}
        className="flex w-full items-center justify-between px-2 py-1.5 text-left text-xs font-medium text-zinc-800"
      >
        <span>{title}</span>
        <span
          className={`inline-block text-xs leading-none text-zinc-500 transition-transform ${
            expanded ? "" : "-rotate-90"
          }`}
        >
          ▼
        </span>
      </button>
      {expanded ? (
        <ul className="flex flex-col gap-0.5 border-t border-zinc-100 px-2 py-1.5 text-xs text-zinc-600">
          {rows.map((row) => (
            <li key={row.playerId}>
              {row.playerName}：{row.label}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
