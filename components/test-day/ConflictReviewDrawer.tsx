"use client";

import { useState } from "react";
import type {
  PublicConflict,
  TestDayConflictDecision,
} from "@/lib/testDay/collab/types";
import { HIT_RESULT_VALUES } from "@/lib/gameArchive";

const TYPE_LABEL: Record<PublicConflict["type"], string> = {
  value_mismatch: "数值不一致",
  structure: "结构请求",
  delete_request: "删除请求",
};

function summarizeCandidate(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    return payload == null ? "（空）" : String(payload);
  }
  const row = payload as Record<string, unknown>;
  if (typeof row.seconds === "number") {
    const who = typeof row.playerName === "string" ? row.playerName : "";
    return [who, `${row.seconds} 秒`].filter(Boolean).join(" · ");
  }
  if (typeof row.note === "string") {
    const who =
      typeof row.playerName === "string"
        ? row.playerName
        : Array.isArray(row.memberNames)
          ? row.memberNames.filter((n) => typeof n === "string").join("、")
          : "";
    return [who, row.note || "（空备注）"].filter(Boolean).join(" · ");
  }
  if (typeof row.pitchCall === "string") {
    return `${row.pitchCall === "strike" ? "好球" : "坏球"}${
      row.swung ? " · 挥棒" : ""
    }`;
  }
  if (typeof row.success === "boolean") {
    return row.success
      ? "传球成功"
      : `传球失败${typeof row.blame === "string" ? ` · ${row.blame}` : ""}`;
  }
  if (typeof row.result === "string") return row.result;
  return JSON.stringify(payload);
}

function clonePayload(payload: unknown): Record<string, unknown> | null {
  if (!payload || typeof payload !== "object") return null;
  return { ...(payload as Record<string, unknown>) };
}

function ManualFinalForm({
  conflict,
  busy,
  onResolve,
}: {
  conflict: PublicConflict;
  busy: boolean;
  onResolve: (input: {
    conflictId: string;
    decision: TestDayConflictDecision;
    entryId?: string;
    finalPayload?: unknown;
  }) => Promise<void>;
}) {
  const sample = clonePayload(conflict.candidates[0]?.payload);
  const [seconds, setSeconds] = useState(
    typeof sample?.seconds === "number" ? String(sample.seconds) : ""
  );
  const [note, setNote] = useState(
    typeof sample?.note === "string" ? sample.note : ""
  );
  const [result, setResult] = useState(
    typeof sample?.result === "string" ? sample.result : "LD"
  );
  if (!sample) return null;

  const submit = (finalPayload: Record<string, unknown>) => {
    void onResolve({
      conflictId: conflict.id,
      decision: "manual",
      finalPayload,
    });
  };

  if (typeof sample.seconds === "number") {
    return (
      <form
        className="mt-2 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const value = Number(seconds);
          if (!Number.isFinite(value) || value <= 0) return;
          submit({ ...sample, seconds: value });
        }}
      >
        <input
          type="number"
          step="0.01"
          min="0.01"
          value={seconds}
          onChange={(event) => setSeconds(event.target.value)}
          className="w-24 border border-zinc-300 px-2 py-1 text-xs"
          aria-label="手填秒数"
        />
        <button
          type="submit"
          disabled={busy}
          className="border border-zinc-400 px-2 py-1 text-xs hover:bg-zinc-100 disabled:text-zinc-400"
        >
          手填采用
        </button>
      </form>
    );
  }
  if (typeof sample.note === "string") {
    return (
      <form
        className="mt-2 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          submit({ ...sample, note: note.trim() });
        }}
      >
        <input
          type="text"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          className="min-w-0 flex-1 border border-zinc-300 px-2 py-1 text-xs"
          aria-label="手填备注"
        />
        <button
          type="submit"
          disabled={busy}
          className="border border-zinc-400 px-2 py-1 text-xs hover:bg-zinc-100 disabled:text-zinc-400"
        >
          手填采用
        </button>
      </form>
    );
  }
  if (typeof sample.result === "string") {
    return (
      <form
        className="mt-2 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          submit({ ...sample, result });
        }}
      >
        <select
          value={result}
          onChange={(event) => setResult(event.target.value)}
          className="border border-zinc-300 bg-white px-2 py-1 text-xs"
          aria-label="手填打击结果"
        >
          {HIT_RESULT_VALUES.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={busy}
          className="border border-zinc-400 px-2 py-1 text-xs hover:bg-zinc-100 disabled:text-zinc-400"
        >
          手填采用
        </button>
      </form>
    );
  }
  return null;
}

export default function ConflictReviewDrawer({
  conflicts,
  canResolve,
  busy,
  onResolve,
}: {
  conflicts: PublicConflict[];
  canResolve: boolean;
  busy: boolean;
  onResolve: (input: {
    conflictId: string;
    decision: TestDayConflictDecision;
    entryId?: string;
    finalPayload?: unknown;
  }) => Promise<void>;
}) {
  const open = conflicts.filter((row) => row.reviewStatus === "open");
  if (open.length === 0) return null;

  return (
    <section className="border border-zinc-400 bg-white p-3">
      <h2 className="text-sm font-medium text-zinc-800">
        待裁决冲突（{open.length}）
      </h2>
      {!canResolve ? (
        <p className="mt-1 text-xs text-zinc-500">
          队长或教练裁决后才能归档。
        </p>
      ) : open.some((row) => row.type !== "delete_request") ? (
        <p className="mt-1 text-xs text-zinc-500">
          请采用一条候选作为最终值。不能直接驳回。
        </p>
      ) : null}
      <ul className="mt-2 flex flex-col gap-3">
        {open.map((conflict) => (
          <li key={conflict.id} className="border border-zinc-200 p-2">
            <p className="text-xs text-zinc-600">
              {TYPE_LABEL[conflict.type]}
              {conflict.candidates[0]
                ? ` · ${summarizeCandidate(conflict.candidates[0].payload)}`
                : ""}
            </p>
            <ul className="mt-2 flex flex-col gap-1">
              {conflict.candidates.map((candidate, index) => (
                <li
                  key={candidate.id}
                  className="flex items-start justify-between gap-2 text-xs text-zinc-800"
                >
                  <p className="flex-1 break-all bg-zinc-50 p-1">
                    {summarizeCandidate(candidate.payload)}
                  </p>
                  {canResolve && conflict.type !== "delete_request" ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void onResolve({
                          conflictId: conflict.id,
                          decision: "pick",
                          entryId: candidate.id,
                        })
                      }
                      className="shrink-0 border border-zinc-400 px-2 py-1 hover:bg-zinc-100 disabled:text-zinc-400"
                    >
                      采用候选 {index + 1}
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
            {canResolve && conflict.type !== "delete_request" ? (
              <ManualFinalForm
                conflict={conflict}
                busy={busy}
                onResolve={onResolve}
              />
            ) : null}
            {canResolve && conflict.type === "delete_request" ? (
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void onResolve({
                      conflictId: conflict.id,
                      decision: "approve_delete",
                    })
                  }
                  className="border border-zinc-400 px-2 py-1 text-xs hover:bg-zinc-100 disabled:text-zinc-400"
                >
                  批准删除
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void onResolve({
                      conflictId: conflict.id,
                      decision: "reject_delete",
                    })
                  }
                  className="border border-zinc-400 px-2 py-1 text-xs hover:bg-zinc-100 disabled:text-zinc-400"
                >
                  驳回删除
                </button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
