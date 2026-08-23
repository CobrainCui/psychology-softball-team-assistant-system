"use client";

import { FAILED_SYNC_COPY } from "@/lib/syncOutbox";

export type FailedLocalDraftItem = {
  id: string;
  summary: string;
};

export default function FailedLocalDraftTray({
  items,
  onDismiss,
}: {
  items: FailedLocalDraftItem[];
  onDismiss: (id: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <section className="border border-zinc-400 bg-white p-3">
      <p className="text-sm text-zinc-800">{FAILED_SYNC_COPY}</p>
      <ul className="mt-2 flex flex-col gap-2">
        {items.map((item) => (
          <li
            key={item.id}
            className="flex items-start justify-between gap-2 text-xs text-zinc-700"
          >
            <p className="flex-1">{item.summary}</p>
            <button
              type="button"
              onClick={() => {
                if (!confirm("确认从失败匣移除这条记录？本机将不再提示。")) {
                  return;
                }
                onDismiss(item.id);
              }}
              className="shrink-0 border border-zinc-400 px-2 py-1 hover:bg-zinc-100"
            >
              知道了
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
