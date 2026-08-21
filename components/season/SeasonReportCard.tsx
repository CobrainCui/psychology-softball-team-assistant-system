"use client";

import { useEffect, useState } from "react";
import {
  getCoachYearReport,
  getPersonalYearReport,
  type YearReport,
} from "@/lib/season/reports";

export default function SeasonReportCard({
  mode,
}: {
  mode: "personal" | "coach";
}) {
  const [open, setOpen] = useState(false);
  const [report, setReport] = useState<YearReport | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    const loader = mode === "coach" ? getCoachYearReport : getPersonalYearReport;
    void loader().then((res) => {
      if (!res.success) {
        console.error("云端被拒:", res.error);
        setError(res.error);
        return;
      }
      setReport(res.report);
    });
  }, [open, mode]);

  return (
    <div className="border border-zinc-200 p-4">
      <button
        type="button"
        className="text-left text-xs uppercase text-gray-500"
        onClick={() => setOpen((v) => !v)}
      >
        {mode === "coach" ? "队级年报" : "季报 / 年报"} {open ? "· 收起" : "· 展开"}
      </button>
      {open ? (
        <div className="mt-2 space-y-3 text-sm">
          {error ? <p className="text-red-600">{error}</p> : null}
          {report ? (
            <>
              <p className="font-medium">{report.year} 自然年</p>
              {report.segments.map((seg) => (
                <div key={seg.seasonId ?? "off"} className="border border-zinc-100 p-2">
                  <p>
                    {seg.seasonName}
                    {seg.scrimmage ? " · 教学赛单独标注" : ""}
                  </p>
                  <p className="text-xs text-zinc-500">
                    测试日 {seg.testSessionCount} 次（计数，无应测分母）
                  </p>
                  <p className="text-xs text-zinc-500">
                    确认比赛 {seg.gameCoverage.confirmed} / completed{" "}
                    {seg.gameCoverage.completed}
                    {seg.gameCoverage.ratio != null
                      ? ` · ${Math.round(seg.gameCoverage.ratio * 100)}%`
                      : ""}
                  </p>
                  <p className="text-xs text-zinc-500">
                    LD {seg.hitDist.LD} · FB {seg.hitDist.FB} · GB {seg.hitDist.GB} · PU{" "}
                    {seg.hitDist.PU} · MISS {seg.hitDist.MISS}
                  </p>
                </div>
              ))}
              <p className="text-xs text-zinc-400">{report.footer}</p>
            </>
          ) : (
            <p className="text-zinc-400">加载中…</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
