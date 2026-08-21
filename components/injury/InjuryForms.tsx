"use client";

import { PAIN_AREA_OPTIONS, type PainArea } from "@/lib/clinical/painAreas";
import {
  INJURY_KIND_OPTIONS,
  PAIN_EXERCISE_RELATION_OPTIONS,
  type InjuryKind,
  type PainExerciseRelationId,
} from "@/lib/clinical/injuryKinds";

export function InjuryCaseForm(props: {
  painArea: PainArea;
  locationHint: string;
  injuryKind: InjuryKind;
  painScore: number;
  relations: PainExerciseRelationId[];
  note: string;
  editingCaseId: string | null;
  onPainArea: (v: PainArea) => void;
  onLocationHint: (v: string) => void;
  onInjuryKind: (v: InjuryKind) => void;
  onPainScore: (v: number) => void;
  onToggleRelation: (id: PainExerciseRelationId) => void;
  onNote: (v: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 border border-zinc-900 bg-white p-4">
      <label className="text-xs uppercase text-gray-500">部位</label>
      <div className="flex flex-wrap gap-1">
        {PAIN_AREA_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => props.onPainArea(opt.value)}
            className={`border px-2 py-1 text-xs ${
              props.painArea === opt.value
                ? "border-zinc-900 bg-zinc-900 text-white"
                : "border-zinc-300"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
      <input
        placeholder="更具体的位置（可选）"
        value={props.locationHint}
        onChange={(e) => props.onLocationHint(e.target.value)}
        className="border border-zinc-300 px-3 py-2 text-sm"
      />
      <label className="text-xs uppercase text-gray-500">种类</label>
      <div className="flex flex-wrap gap-1">
        {INJURY_KIND_OPTIONS.map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => props.onInjuryKind(opt.id)}
            className={`border px-2 py-1 text-xs ${
              props.injuryKind === opt.id
                ? "border-zinc-900 bg-zinc-900 text-white"
                : "border-zinc-300"
            }`}
            title={opt.hint}
          >
            {opt.label}
          </button>
        ))}
      </div>
      {!props.editingCaseId ? (
        <>
          <label className="text-xs uppercase text-gray-500">疼痛 0–10</label>
          <input
            type="range"
            min={0}
            max={10}
            value={props.painScore}
            onChange={(e) => props.onPainScore(Number(e.target.value))}
            className="accent-zinc-900"
          />
          <span className="text-right font-mono text-sm">{props.painScore}</span>
          <div className="flex flex-wrap gap-1">
            {PAIN_EXERCISE_RELATION_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => props.onToggleRelation(opt.id)}
                className={`border px-2 py-1 text-xs ${
                  props.relations.includes(opt.id)
                    ? "border-zinc-900 bg-zinc-900 text-white"
                    : "border-zinc-300"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <textarea
            placeholder="备注（可选）"
            value={props.note}
            onChange={(e) => props.onNote(e.target.value)}
            className="min-h-16 border border-zinc-300 px-3 py-2 text-sm"
          />
        </>
      ) : null}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={props.onSave}
          className="flex-1 bg-black py-2 text-sm text-white"
        >
          {props.editingCaseId ? "保存修改" : "保存"}
        </button>
        <button
          type="button"
          onClick={props.onCancel}
          className="flex-1 border border-zinc-300 py-2 text-sm"
        >
          取消
        </button>
      </div>
    </div>
  );
}

export function InjuryPainForm(props: {
  title: string;
  painScore: number;
  relations: PainExerciseRelationId[];
  editing: boolean;
  onPainScore: (v: number) => void;
  onToggleRelation: (id: PainExerciseRelationId) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="flex flex-col gap-2 border border-zinc-900 bg-white p-4">
      <p className="text-sm">{props.title}</p>
      <input
        type="range"
        min={0}
        max={10}
        value={props.painScore}
        onChange={(e) => props.onPainScore(Number(e.target.value))}
        className="accent-zinc-900"
      />
      <span className="text-right font-mono text-sm">{props.painScore}</span>
      <div className="flex flex-wrap gap-1">
        {PAIN_EXERCISE_RELATION_OPTIONS.map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => props.onToggleRelation(opt.id)}
            className={`border px-2 py-1 text-xs ${
              props.relations.includes(opt.id)
                ? "border-zinc-900 bg-zinc-900 text-white"
                : "border-zinc-300"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={props.onSave}
          className="flex-1 bg-black py-2 text-sm text-white"
        >
          {props.editing ? "保存修改" : "记录"}
        </button>
        <button
          type="button"
          onClick={props.onCancel}
          className="flex-1 border py-2 text-sm"
        >
          取消
        </button>
      </div>
    </div>
  );
}

export function InjuryNoteForm(props: {
  title: string;
  content: string;
  editing: boolean;
  onContent: (v: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="flex flex-col gap-2 border border-zinc-900 bg-white p-4">
      <p className="text-sm">{props.title}</p>
      <textarea
        value={props.content}
        onChange={(e) => props.onContent(e.target.value)}
        className="min-h-20 border border-zinc-300 px-3 py-2 text-sm"
      />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={props.onSave}
          className="flex-1 bg-black py-2 text-sm text-white"
        >
          {props.editing ? "保存修改" : "保存"}
        </button>
        <button
          type="button"
          onClick={props.onCancel}
          className="flex-1 border py-2 text-sm"
        >
          取消
        </button>
      </div>
    </div>
  );
}
