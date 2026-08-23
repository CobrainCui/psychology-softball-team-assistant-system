"use client";

import { useState } from "react";
import {
  ACTIVITY_TYPE_OPTIONS,
  MAX_CUSTOM_ACTIVITY_COUNT,
  MAX_CUSTOM_ACTIVITY_LEN,
  coerceActivityTypeToken,
  isPresetActivityType,
  type PresetActivityType,
} from "@/lib/clinical/activityTypes";

type Props = {
  selected: string[];
  onChange: (next: string[]) => void;
};

export function ActivityTypePicker({ selected, onChange }: Props) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");

  const customSelected = selected.filter((x) => !isPresetActivityType(x));

  const togglePreset = (value: PresetActivityType) => {
    onChange(
      selected.includes(value)
        ? selected.filter((x) => x !== value)
        : [...selected, value]
    );
  };

  const commitDraft = () => {
    const token = coerceActivityTypeToken(draft);
    setDraft("");
    setAdding(false);
    if (!token) return;
    if (selected.includes(token)) return;
    if (
      !isPresetActivityType(token) &&
      customSelected.length >= MAX_CUSTOM_ACTIVITY_COUNT
    ) {
      return;
    }
    onChange([...selected, token]);
  };

  return (
    <div className="flex flex-col gap-2 border border-zinc-200 p-4">
      <label className="text-xs uppercase text-gray-500">活动类型</label>
      <div className="flex flex-wrap gap-1">
        {ACTIVITY_TYPE_OPTIONS.map((opt) => {
          const on = selected.includes(opt.value);
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => togglePreset(opt.value)}
              className={`border px-3 py-1.5 text-xs ${
                on
                  ? "border-zinc-900 bg-zinc-900 text-white"
                  : "border-zinc-300 text-zinc-600"
              }`}
            >
              {opt.label}
            </button>
          );
        })}
        {customSelected.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() =>
              onChange(selected.filter((x) => x !== value))
            }
            className="border border-zinc-900 bg-zinc-900 px-3 py-1.5 text-xs text-white"
          >
            {value}
          </button>
        ))}
        {adding ? (
          <input
            autoFocus
            maxLength={MAX_CUSTOM_ACTIVITY_LEN}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitDraft();
              }
              if (e.key === "Escape") {
                setAdding(false);
                setDraft("");
              }
            }}
            onBlur={commitDraft}
            className="w-28 border border-zinc-900 px-2 py-1.5 text-xs"
          />
        ) : customSelected.length < MAX_CUSTOM_ACTIVITY_COUNT ? (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="border border-zinc-300 px-3 py-1.5 text-xs text-zinc-600"
            aria-label="添加活动类型"
          >
            +
          </button>
        ) : null}
      </div>
    </div>
  );
}
