"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import MedicalDisclaimer from "@/components/MedicalDisclaimer";
import {
  getCoachDaySummary,
  type CoachDaySummary,
  type CoachDualTrackRow,
  type CoachFlagRow,
  type CoachSessionFeedbackRow,
} from "@/lib/actions";
import { getTodayDateStr } from "@/lib/readinessHistory";
import { useRequireAuth } from "@/lib/useRequireAuth";

function DualList({
  title,
  emptyText,
  rows,
  tone,
}: {
  title: string;
  emptyText: string;
  rows: CoachDualTrackRow[];
  tone: "red" | "yellow" | "neutral";
}) {
  const border =
    tone === "red"
      ? "border-red-600"
      : tone === "yellow"
        ? "border-amber-500"
        : "border-zinc-300";

  return (
    <div className={`flex flex-col gap-2 border ${border} p-4`}>
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase text-zinc-700">
          {title}
        </h2>
        <span className="font-mono text-xs text-zinc-500">{rows.length}</span>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-zinc-400">{emptyText}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((row) => (
            <li
              key={row.playerId}
              className="border border-zinc-200 bg-white px-3 py-2 text-sm"
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-medium">{row.playerName}</span>
                <span className="font-mono text-xs text-zinc-500">
                  {row.readinessScore != null
                    ? `${row.readinessScore}`
                    : "—"}
                  {row.loadBandLabel ? ` · ${row.loadBandLabel}` : ""}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-zinc-500">
                可用性 {row.availabilityLabel}
                {row.painAreaLabel ? ` · ${row.painAreaLabel}` : ""}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FlagList({
  title,
  emptyText,
  rows,
  tone,
}: {
  title: string;
  emptyText: string;
  rows: CoachFlagRow[];
  tone: "red" | "yellow";
}) {
  const border =
    tone === "red" ? "border-red-600" : "border-amber-500";
  const titleColor =
    tone === "red" ? "text-red-700" : "text-amber-700";

  return (
    <div className={`flex flex-col gap-2 border ${border} p-4`}>
      <div className="flex items-baseline justify-between gap-2">
        <h2 className={`text-xs font-semibold uppercase ${titleColor}`}>
          {title}
        </h2>
        <span className="font-mono text-xs text-zinc-500">{rows.length}</span>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-zinc-400">{emptyText}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((row) => (
            <li
              key={row.playerId}
              className="border border-zinc-200 bg-white px-3 py-2 text-sm"
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-medium">{row.playerName}</span>
                <span className="font-mono text-xs text-zinc-500">
                  {row.readinessScore}/100
                </span>
              </div>
              <p className="mt-0.5 text-xs text-zinc-500">{row.reason}</p>
              {row.physiologicalLoadLabel && (
                <p className="mt-1 text-xs text-zinc-600">
                  生理负荷：{row.physiologicalLoadLabel}
                  {row.physiologicalLoadHint
                    ? ` · ${row.physiologicalLoadHint}`
                    : ""}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SessionFeedbackList({ rows }: { rows: CoachSessionFeedbackRow[] }) {
  const list = Array.isArray(rows) ? rows : [];
  return (
    <div className="flex flex-col gap-2 border border-zinc-900 p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase text-zinc-700">
          今日训后反馈（队员 · 私密）
        </h2>
        <span className="font-mono text-xs text-zinc-500">{list.length}</span>
      </div>
      {list.length === 0 ? (
        <p className="text-sm text-zinc-400">当日尚无队员训后反馈</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {list.map((row) => (
            <li
              key={row.playerId}
              className={`border px-3 py-2 text-sm ${
                row.hasPain
                  ? "border-amber-400 bg-amber-50"
                  : "border-zinc-200 bg-white"
              }`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-medium">{row.playerName}</span>
                <span className="font-mono text-xs text-zinc-500">
                  RPE {row.sessionRpe} · {row.durationMin}min · 负荷{" "}
                  {row.loadAu}
                </span>
              </div>
              {row.hasPain && (
                <p className="mt-0.5 text-xs text-amber-800">
                  有不适
                  {row.painAreaLabel ? ` · ${row.painAreaLabel}` : ""}
                </p>
              )}
              {row.note && (
                <p className="mt-1 text-xs text-zinc-600">「{row.note}」</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function CoachSummaryPage() {
  const { currentUser, isMounted } = useRequireAuth();
  const router = useRouter();
  const [date, setDate] = useState(getTodayDateStr);
  const [summary, setSummary] = useState<CoachDaySummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!isMounted || !currentUser) return;
    if (currentUser.role !== "coach") {
      router.replace("/assessment");
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    (async () => {
      const res = await getCoachDaySummary(currentUser.playerId, date);
      if (cancelled) return;
      if (!res.success) {
        console.error("云端被拒:", res.error);
        setSummary(null);
        setError(res.error);
      } else {
        setSummary(res.summary);
      }
      setIsLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [isMounted, currentUser?.playerId, currentUser?.role, date, router]);

  if (!isMounted || !currentUser) return null;
  if (currentUser.role !== "coach") return null;

  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 p-6">
      <main className="flex w-full max-w-2xl flex-col gap-4">
        <div className="text-center">
          <h1 className="text-sm font-medium tracking-wide text-zinc-500">
            教练日摘要
          </h1>
          <p className="mt-1 text-xs text-zinc-400">
            体能准备度 + 上场可用性双轨 · 训后反馈在下方
          </p>
        </div>

        <MedicalDisclaimer />

        <div className="flex flex-col gap-2 border border-zinc-200 p-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-col gap-1">
            <label className="text-xs uppercase text-gray-500">日期</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="border border-zinc-300 px-3 py-2 text-sm"
            />
          </div>
          {summary && (
            <p className="text-xs text-zinc-500">
              准备度 {summary.checkedInCount}/{summary.rosterCount}
              {summary.uncheckedCount > 0
                ? ` · 未打卡 ${summary.uncheckedCount}`
                : ""}
              {` · 训后 ${summary.feedbackCount}`}
            </p>
          )}
        </div>

        {isLoading && (
          <p className="text-center text-sm text-zinc-400">加载中…</p>
        )}
        {error && (
          <p className="border border-red-300 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        )}

        {!isLoading && !error && summary && (
          <>
            <DualList
              title="伤缺 · Unavailable"
              emptyText="当日无伤缺"
              rows={summary.unavailable ?? []}
              tone="red"
            />
            <DualList
              title="限制性可用 · Modified"
              emptyText="当日无限制性可用"
              rows={summary.modified ?? []}
              tone="yellow"
            />
            <DualList
              title="体能需减量"
              emptyText="当日无体能减量"
              rows={summary.energyReduced ?? []}
              tone="yellow"
            />
            <FlagList
              title="体能红牌（恢复课）"
              emptyText="无"
              rows={summary.red}
              tone="red"
            />
            <FlagList
              title="体能黄牌"
              emptyText="无"
              rows={summary.yellow}
              tone="yellow"
            />
            {(summary.loadNotes?.length ?? 0) > 0 && (
              <FlagList
                title="生理负荷提示（脱敏）"
                emptyText=""
                rows={summary.loadNotes}
                tone="yellow"
              />
            )}
            <SessionFeedbackList rows={summary.sessionFeedbacks} />
          </>
        )}
      </main>
    </div>
  );
}
