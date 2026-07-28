"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import MedicalDisclaimer from "@/components/MedicalDisclaimer";
import {
  PAIN_AREA_OPTIONS,
  type PainArea,
} from "@/lib/clinical/painAreas";
import { saveSessionFeedback } from "@/lib/actions";
import { getTodayDateStr } from "@/lib/readinessHistory";
import { upsertSessionFeedbackDraft } from "@/lib/sessionFeedback";
import { useRequireAuth } from "@/lib/useRequireAuth";

const DEFAULT_DURATION_MIN = 90;

function buildPrehabHref(area: PainArea): string {
  const params = new URLSearchParams({
    area,
    from: "feedback",
  });
  return `/prehab?${params.toString()}`;
}

export default function SessionFeedbackPage() {
  const { currentUser, isMounted } = useRequireAuth();
  const router = useRouter();

  const [sessionRpe, setSessionRpe] = useState(5);
  const [durationMin, setDurationMin] = useState(DEFAULT_DURATION_MIN);
  const [hasPain, setHasPain] = useState(false);
  const [painArea, setPainArea] = useState<PainArea>("shoulder");
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<
    "idle" | "saving" | "saved" | "local"
  >("idle");

  // 教练只读队员反馈，不走录入页
  useEffect(() => {
    if (!isMounted || !currentUser) return;
    if (currentUser.role === "coach") {
      router.replace("/coach");
    }
  }, [isMounted, currentUser, router]);

  const handleSubmit = async () => {
    if (!currentUser || status === "saving") return;
    if (hasPain && !painArea) return;

    setStatus("saving");
    const date = getTodayDateStr();
    const noteTrimmed = note.trim() ? note.trim().slice(0, 200) : null;

    const res = await saveSessionFeedback({
      playerId: currentUser.playerId,
      date,
      sessionRpe,
      durationMin,
      hasPain,
      painArea: hasPain ? painArea : null,
      note: noteTrimmed,
    });

    if (res.success) {
      setStatus("saved");
      window.alert("已私密提交给教练。");
    } else {
      console.error("云端被拒:", res.error);
      upsertSessionFeedbackDraft({
        playerId: currentUser.playerId,
        playerName: currentUser.playerName,
        date,
        sessionRpe,
        durationMin,
        hasPain,
        painArea: hasPain ? painArea : null,
        note: noteTrimmed,
      });
      setStatus("local");
      window.alert("云端同步失败，已保存为本地草稿。");
    }

    setTimeout(() => setStatus("idle"), 2500);
  };

  if (!isMounted || !currentUser) return null;
  if (currentUser.role === "coach") return null;

  const loadAu = sessionRpe * durationMin;

  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 p-6">
      <main className="flex w-full max-w-2xl flex-col gap-4">
        <div className="text-center">
          <h1 className="text-sm font-medium tracking-wide text-zinc-500">
            训后反馈
          </h1>
          <p className="mt-1 text-xs text-zinc-400">
            当前球员：{currentUser.playerName}
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            仅教练可见 · 不当众点名 · 约 1 分钟
          </p>
        </div>

        <MedicalDisclaimer />

        <div className="border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs leading-relaxed text-zinc-500">
          训练结束约 30 分钟后填写更准。这是私下给教练的负荷与不适通道，不是全队公示。
        </div>

        <div className="flex flex-col gap-2 border border-zinc-200 p-4">
          <label className="text-xs uppercase text-gray-500">
            这场整体有多累？(Session RPE 1–10)
          </label>
          <input
            type="range"
            min={1}
            max={10}
            step={1}
            value={sessionRpe}
            onChange={(e) => setSessionRpe(Number(e.target.value))}
            className="accent-zinc-900"
          />
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span>1 很轻松</span>
            <span className="font-mono text-sm text-zinc-900">{sessionRpe}</span>
            <span>10 筋疲力尽</span>
          </div>
        </div>

        <div className="flex flex-col gap-2 border border-zinc-200 p-4">
          <label className="text-xs uppercase text-gray-500">
            大约练了多久（分钟）
          </label>
          <input
            type="number"
            min={1}
            max={360}
            value={durationMin}
            onChange={(e) => setDurationMin(Number(e.target.value) || 1)}
            className="border border-zinc-300 px-3 py-2 font-mono text-sm text-zinc-900"
          />
          <p className="text-xs text-zinc-400">
            内在负荷（仅记录）= RPE × 时长 ={" "}
            <span className="font-mono text-zinc-700">{loadAu}</span>
          </p>
        </div>

        <div className="flex flex-col gap-3 border border-zinc-200 p-4">
          <div className="flex items-center justify-between">
            <label className="text-xs uppercase text-gray-500">
              训练中/后是否有身体不适？
            </label>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => setHasPain(false)}
                className={`border px-4 py-1.5 text-xs transition-colors ${
                  !hasPain
                    ? "border-zinc-900 bg-zinc-900 text-white"
                    : "border-zinc-300 text-zinc-500 hover:bg-zinc-100"
                }`}
              >
                否
              </button>
              <button
                type="button"
                onClick={() => setHasPain(true)}
                className={`border px-4 py-1.5 text-xs transition-colors ${
                  hasPain
                    ? "border-amber-600 bg-amber-600 text-white"
                    : "border-zinc-300 text-zinc-500 hover:bg-zinc-100"
                }`}
              >
                是
              </button>
            </div>
          </div>

          {hasPain && (
            <div className="flex flex-col gap-2 border-t border-zinc-200 pt-3">
              <label className="text-xs uppercase text-gray-500">不适部位</label>
              <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
                {PAIN_AREA_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setPainArea(option.value)}
                    className={`border py-2 text-xs transition-colors ${
                      painArea === option.value
                        ? "border-zinc-900 bg-zinc-900 text-white"
                        : "border-zinc-300 text-zinc-500 hover:bg-zinc-100"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <Link
                href={buildPrehabHref(painArea)}
                className="text-xs text-zinc-600 underline underline-offset-2 hover:text-zinc-900"
              >
                可选：前往「运动损伤」填写伤后建议
              </Link>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2 border border-zinc-200 p-4">
          <label className="text-xs uppercase text-gray-500">
            想让教练知道的一句（可选，最多 200 字）
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, 200))}
            rows={3}
            placeholder="例如：跑垒变向膝盖发软；连续传杀后肩酸加重…"
            className="border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-300"
          />
          <span className="text-right text-xs text-zinc-400">
            {note.length}/200
          </span>
        </div>

        <button
          type="button"
          onClick={() => void handleSubmit()}
          disabled={status === "saving"}
          className="bg-black py-2 text-sm text-white transition-colors hover:bg-zinc-800 disabled:bg-zinc-300 disabled:text-zinc-500 disabled:hover:bg-zinc-300"
        >
          {status === "saving"
            ? "提交中…"
            : status === "saved"
              ? "已提交给教练"
              : status === "local"
                ? "已存本地草稿"
                : "私密提交给教练"}
        </button>
      </main>
    </div>
  );
}
