"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import PageLoading from "@/components/PageLoading";
import ArchivedPlayerReview from "@/components/test-day/ArchivedPlayerReview";
import RetryNotice from "@/components/test-day/RetryNotice";
import { getArchivedTestSession } from "@/lib/testDay/sessionReadActions";
import type { ArchivedSessionDetailDto } from "@/lib/testDay/sessionReadActions";
import { buildArchivePlayerReviews } from "@/lib/testDay/archivePlayerReview";

function countCaught(session: ArchivedSessionDetailDto): string {
  const rows = session.archive.flyCatchAttempts;
  if (rows.length === 0) return "无记录";
  const caught = rows.filter((row) => row.caught).length;
  return `${caught}/${rows.length} 接住`;
}

function countThrows(session: ArchivedSessionDetailDto): string {
  const rows = session.archive.throwPlays;
  if (rows.length === 0) return "无记录";
  const ok = rows.filter((row) => row.success).length;
  return `${ok}/${rows.length} 成功`;
}

export default function ArchivedSessionDetail({
  sessionId,
}: {
  sessionId: string;
}) {
  const [data, setData] = useState<ArchivedSessionDetailDto | null>(null);
  const [error, setError] = useState("");
  const [loadNonce, setLoadNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        const res = await getArchivedTestSession(sessionId);
        if (cancelled) return;
        if (!res.success) {
          console.error("云端被拒:", res.error);
          setError(res.error);
          setData(null);
          return;
        }
        setError("");
        setData(res.session);
      })();
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [sessionId, loadNonce]);

  if (error) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-zinc-50 p-6">
        <RetryNotice
          message={error}
          onRetry={() => {
            setError("");
            setLoadNonce((n) => n + 1);
          }}
        />
        <Link href="/" className="text-sm text-zinc-500 underline">
          返回大厅
        </Link>
      </div>
    );
  }

  if (!data) return <PageLoading />;

  const assignmentRows = Object.entries(data.archive.assignments);
  const speedMarks = data.archive.speedMarks;

  return (
    <div className="flex flex-1 justify-center bg-zinc-50 p-4">
      <div className="flex w-full max-w-3xl flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-sm font-medium tracking-wide text-zinc-500">
              归档测试日
            </h1>
            <p className="text-sm text-zinc-800">{data.date} · 只读</p>
          </div>
          <Link
            href="/"
            className="border border-zinc-400 px-3 py-1.5 text-sm text-zinc-800 hover:bg-zinc-100"
          >
            返回大厅
          </Link>
        </div>

        <details className="border border-zinc-300 bg-white p-3" open>
          <summary className="cursor-pointer text-sm text-zinc-800">
            测试项（{data.archive.testItems.length}）
          </summary>
          <ul className="mt-2 flex flex-col gap-1 text-sm text-zinc-700">
            {data.archive.testItems.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </details>

        <details className="border border-zinc-300 bg-white p-3">
          <summary className="cursor-pointer text-sm text-zinc-800">
            排阵（{assignmentRows.length} 人）
          </summary>
          {assignmentRows.length === 0 ? (
            <p className="mt-2 text-sm text-zinc-500">无排阵快照。</p>
          ) : (
            <ul className="mt-2 flex flex-col gap-2 text-sm text-zinc-700">
              {assignmentRows.map(([playerId, items]) => (
                <li key={playerId}>
                  {data.playerNames[playerId] ?? playerId}：{items.join("、")}
                </li>
              ))}
            </ul>
          )}
        </details>

        <details className="border border-zinc-300 bg-white p-3">
          <summary className="cursor-pointer text-sm text-zinc-800">
            修改记录（{data.archive.assignmentLog.length}）
          </summary>
          {data.archive.assignmentLog.length === 0 ? (
            <p className="mt-2 text-sm text-zinc-500">无修改记录。</p>
          ) : (
            <ul className="mt-2 flex flex-col gap-2 text-sm text-zinc-700">
              {data.archive.assignmentLog.map((row) => (
                <li key={row.id}>
                  {row.author}：{row.summary}
                  {row.note ? ` · ${row.note}` : ""}
                </li>
              ))}
            </ul>
          )}
        </details>

        <details className="border border-zinc-300 bg-white p-3" open>
          <summary className="cursor-pointer text-sm text-zinc-800">
            逐人成绩
          </summary>
          <ArchivedPlayerReview
            players={buildArchivePlayerReviews(data.archive, data.playerNames)}
          />
        </details>

        <details className="border border-zinc-300 bg-white p-3">
          <summary className="cursor-pointer text-sm text-zinc-800">
            成绩摘要
          </summary>
          <ul className="mt-2 flex flex-col gap-1 text-sm text-zinc-700">
            <li>打击 {data.archive.hits.length} 记</li>
            <li>测速格 {speedMarks.length} 记</li>
            <li>接高飞 {countCaught(data)}</li>
            <li>好球判断 {data.archive.strikeJudgeCells.length} 格</li>
            <li>传球 {countThrows(data)}</li>
          </ul>
        </details>

        <details className="border border-zinc-300 bg-white p-3">
          <summary className="cursor-pointer text-sm text-zinc-800">
            自定义备注
          </summary>
          <ul className="mt-2 flex flex-col gap-1 text-sm text-zinc-700">
            {data.archive.customPlayerNotes.map((row) => (
              <li key={row.id}>
                {row.testItem} · {row.playerName}：{row.note || "（空）"}
              </li>
            ))}
            {data.archive.customGroupNotes.map((row) => (
              <li key={row.id}>
                {row.testItem} · {row.memberNames.join("、")}：
                {row.note || "（空）"}
              </li>
            ))}
            {data.archive.customSingleNotes.map((row) => (
              <li key={row.id}>
                {row.testItem}：{row.note || "（空）"}
              </li>
            ))}
            {data.archive.customPlayerNotes.length === 0 &&
            data.archive.customGroupNotes.length === 0 &&
            data.archive.customSingleNotes.length === 0 ? (
              <li className="text-zinc-500">无自定义备注。</li>
            ) : null}
          </ul>
        </details>
      </div>
    </div>
  );
}
