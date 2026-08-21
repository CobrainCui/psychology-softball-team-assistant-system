"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import PageLoading from "@/components/PageLoading";
import { getPlayers } from "@/lib/actions";
import { listGameFiles } from "@/lib/season/fileActions";
import { parseIScoreFromFile } from "@/lib/season/iscoreActions";
import { confirmGameSummary } from "@/lib/season/summaryActions";
import { useRequireAuth } from "@/lib/useRequireAuth";
import type { GameFileDto } from "@/lib/season/types";
import type { IScoreParsed } from "@/lib/season/types";

export default function IScoreImportPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = use(params);
  const { currentUser, isMounted } = useRequireAuth();
  const router = useRouter();
  const [files, setFiles] = useState<GameFileDto[]>([]);
  const [fileId, setFileId] = useState("");
  const [parsed, setParsed] = useState<IScoreParsed | null>(null);
  const [error, setError] = useState("");

  const canManage = Boolean(
    currentUser?.roles.includes("captain") || currentUser?.roles.includes("coach")
  );

  useEffect(() => {
    if (!isMounted || !currentUser) return;
    if (!canManage) {
      router.replace("/schedule");
      return;
    }
    void listGameFiles(eventId).then((res) => {
      if (res.success) setFiles(res.files);
    });
  }, [isMounted, currentUser, canManage, eventId, router]);

  if (!isMounted || !currentUser) return <PageLoading />;

  return (
    <main className="mx-auto max-w-xl px-4 py-8 text-sm">
      <h1 className="mb-4 text-sm font-medium tracking-wide text-zinc-500">
        iScore 导入确认
      </h1>
      <p className="mb-4 text-zinc-500">
        仅接受 ISCORE-TEXT v1 文字层。解析结果必须人工确认后才落库。
      </p>
      {error ? <p className="text-red-600">{error}</p> : null}
      <select
        className="mb-3 w-full border border-zinc-300 px-2 py-1"
        value={fileId}
        onChange={(e) => setFileId(e.target.value)}
      >
        <option value="">选择 PDF</option>
        {files.map((f) => (
          <option key={f.id} value={f.id}>
            {f.originalName}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="mb-4 border border-zinc-300 px-3 py-1"
        onClick={() => {
          if (!fileId) return;
          void parseIScoreFromFile(fileId).then((res) => {
            if (!res.success) {
              console.error("云端被拒:", res.error);
              setParsed(null);
              setError(res.error);
              return;
            }
            setError("");
            setParsed(res.parsed);
          });
        }}
      >
        解析
      </button>
      {parsed ? (
        <div className="border border-zinc-200 p-4">
          <p>日期 {parsed.date}</p>
          <p>对手 {parsed.opponent ?? "—"}</p>
          <p>
            比分 {parsed.ourScore ?? "—"}-{parsed.opponentScore ?? "—"} ·{" "}
            {parsed.result}
          </p>
          <ul className="mt-2">
            {parsed.players.map((p) => (
              <li key={p.name}>
                {p.name} {p.participated ? "出场" : "未出场"}
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="mt-4 bg-black px-3 py-1 text-white"
            onClick={() => {
              void (async () => {
                const roster = await getPlayers();
                if (!roster.success) {
                  setError(roster.error);
                  return;
                }
                const lines = parsed.players
                  .map((row) => {
                    const hit = roster.players.find((p) => p.name === row.name);
                    return hit
                      ? { playerId: hit.id, participated: row.participated }
                      : null;
                  })
                  .filter((row): row is { playerId: string; participated: boolean } =>
                    Boolean(row)
                  );
                const res = await confirmGameSummary({
                  eventId,
                  ourScore: parsed.ourScore,
                  opponentScore: parsed.opponentScore,
                  result: parsed.result,
                  source: "iscore_pdf",
                  sourceFileId: fileId,
                  lines,
                });
                if (!res.success) {
                  console.error("云端被拒:", res.error);
                  setError(res.error);
                  return;
                }
                router.push("/schedule");
              })();
            }}
          >
            确认写入
          </button>
        </div>
      ) : null}
    </main>
  );
}
