"use client";

import type { PublicConflict } from "@/lib/testDay/collab/types";

const TYPE_LABEL: Record<PublicConflict["type"], string> = {
  value_mismatch: "数值不一致",
  structure: "结构请求",
  delete_request: "删除请求",
};

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
    decision: "pick" | "manual" | "dismiss";
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
      ) : null}
      <ul className="mt-2 flex flex-col gap-3">
        {open.map((conflict) => (
          <li key={conflict.id} className="border border-zinc-200 p-2">
            <p className="text-xs text-zinc-600">
              {TYPE_LABEL[conflict.type]} · {conflict.entityKey}
            </p>
            <ul className="mt-2 flex flex-col gap-1">
              {conflict.candidates.map((candidate, index) => (
                <li
                  key={candidate.id}
                  className="flex items-start justify-between gap-2 text-xs text-zinc-800"
                >
                  <pre className="max-h-24 flex-1 overflow-auto whitespace-pre-wrap break-all bg-zinc-50 p-1">
                    {JSON.stringify(candidate.payload)}
                  </pre>
                  {canResolve ? (
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
            {canResolve ? (
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    const raw = window.prompt("手填最终 JSON");
                    if (!raw) return;
                    try {
                      const finalPayload = JSON.parse(raw) as unknown;
                      void onResolve({
                        conflictId: conflict.id,
                        decision: "manual",
                        finalPayload,
                      });
                    } catch {
                      window.alert("JSON 无效");
                    }
                  }}
                  className="border border-zinc-400 px-2 py-1 text-xs hover:bg-zinc-100 disabled:text-zinc-400"
                >
                  手填最终值
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void onResolve({
                      conflictId: conflict.id,
                      decision: "dismiss",
                    })
                  }
                  className="border border-zinc-400 px-2 py-1 text-xs hover:bg-zinc-100 disabled:text-zinc-400"
                >
                  驳回
                </button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
