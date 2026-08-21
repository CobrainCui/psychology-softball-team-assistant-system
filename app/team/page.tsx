"use client";

import { useRequireAuth } from "@/lib/useRequireAuth";
import PageLoading from "@/components/PageLoading";
import { getTeamOpsSummary } from "@/lib/status/coachActions";
import { useEffect, useState } from "react";
import type { TeamOpsSummary } from "@/lib/status/coachActions";

export default function TeamPage() {
  const { currentUser, isMounted, loading } = useRequireAuth();
  const [summary, setSummary] = useState<TeamOpsSummary | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isMounted || loading || !currentUser) return;
    const canView =
      currentUser.roles.includes("captain") ||
      currentUser.roles.includes("coach");
    if (!canView) return;
    getTeamOpsSummary().then((res) => {
      if (!res.success) {
        setError(res.error);
        return;
      }
      setSummary(res.summary);
    });
  }, [isMounted, loading, currentUser]);

  if (!isMounted || loading) return <PageLoading />;
  if (!currentUser) return <PageLoading />;

  const canView =
    currentUser.roles.includes("captain") ||
    currentUser.roles.includes("coach");
  if (!canView) {
    return (
      <main className="px-6 py-12 text-center text-zinc-500">
        仅队长或教练可查看队务提交情况
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-8">
      <h1 className="mb-2 text-2xl font-bold">队务提交</h1>
      <p className="mb-6 text-sm text-zinc-500">
        仅显示是否已提交评估/训后，不含分数与健康明细。
      </p>
      {error ? <p className="text-red-600">{error}</p> : null}
      {summary ? (
        <ul className="divide-y border border-zinc-200 bg-white">
          {summary.rows.map((row) => (
            <li
              key={row.playerId}
              className="flex items-center justify-between px-4 py-3 text-sm"
            >
              <span>{row.playerName}</span>
              <span className="text-zinc-500">
                评估{row.readinessSubmitted ? "✓" : "—"} · 训后
                {row.feedbackSubmitted ? "✓" : "—"}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <PageLoading />
      )}
    </main>
  );
}
