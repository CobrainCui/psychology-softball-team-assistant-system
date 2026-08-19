"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import MedicalDisclaimer from "@/components/MedicalDisclaimer";
import { TeamQuadrantChart } from "@/components/status/TeamQuadrantChart";
import {
  getCoachDaySummary,
  type CoachDaySummary,
} from "@/lib/actions";
import { getTodayDateStr } from "@/lib/readinessHistory";
import { useRequireAuth } from "@/lib/useRequireAuth";

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
            全队四象限 · 训后反馈与活跃损伤在下方
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
              打卡 {summary.checkedInCount}/{summary.rosterCount}
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
            <TeamQuadrantChart points={summary.plotted} />
            {summary.unchecked.length > 0 && (
              <div className="border border-zinc-200 p-4">
                <h2 className="text-xs font-semibold uppercase text-zinc-700">
                  未打卡
                </h2>
                <p className="mt-2 text-sm text-zinc-600">
                  {summary.unchecked.map((r) => r.playerName).join("、")}
                </p>
              </div>
            )}
            {summary.watchList.length > 0 && (
              <div className="border border-amber-500 p-4">
                <h2 className="text-xs font-semibold uppercase text-amber-700">
                  需关注象限
                </h2>
                <ul className="mt-2 flex flex-col gap-1 text-sm">
                  {summary.watchList.map((p) => (
                    <li key={p.playerId}>
                      {p.playerName} · {p.quadrantLabel}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="border border-zinc-200 p-4">
              <h2 className="text-xs font-semibold uppercase text-zinc-700">
                活跃损伤
              </h2>
              {summary.activeInjuries.length === 0 ? (
                <p className="mt-2 text-sm text-zinc-400">当日无活跃损伤 episode</p>
              ) : (
                <ul className="mt-2 flex flex-col gap-1 text-sm">
                  {summary.activeInjuries.map((row) => (
                    <li key={`${row.playerId}-${row.painAreaLabel}`}>
                      {row.playerName} · {row.painAreaLabel}
                      {row.latestPain != null ? ` · 痛分 ${row.latestPain}` : ""}
                      {` · ${row.trendLabel}`}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {summary.loadNotes.length > 0 && (
              <div className="border border-amber-500 p-4">
                <h2 className="text-xs font-semibold uppercase text-amber-700">
                  生理负荷提示（脱敏）
                </h2>
                <ul className="mt-2 flex flex-col gap-1 text-sm">
                  {summary.loadNotes.map((row) => (
                    <li key={row.playerId}>
                      {row.playerName} · {row.physiologicalLoadLabel}
                      {row.physiologicalLoadHint
                        ? ` · ${row.physiologicalLoadHint}`
                        : ""}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="border border-zinc-900 p-4">
              <h2 className="text-xs font-semibold uppercase text-zinc-700">
                今日训后反馈（队员 · 私密）
              </h2>
              {summary.sessionFeedbacks.length === 0 ? (
                <p className="mt-2 text-sm text-zinc-400">当日尚无队员训后反馈</p>
              ) : (
                <ul className="mt-2 flex flex-col gap-2">
                  {summary.sessionFeedbacks.map((row) => (
                    <li
                      key={row.id}
                      className="border border-zinc-200 bg-white px-3 py-2 text-sm"
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="font-medium">{row.playerName}</span>
                        <span className="font-mono text-xs text-zinc-500">
                          {row.activityLabel} · RPE {row.sessionRpe} ·{" "}
                          {row.durationMin}min · 负荷 {row.sessionLoad}
                        </span>
                      </div>
                      {row.note && (
                        <p className="mt-1 text-xs text-zinc-600">
                          「{row.note}」
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
