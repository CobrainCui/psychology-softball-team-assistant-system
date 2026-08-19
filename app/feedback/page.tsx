"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import MedicalDisclaimer from "@/components/MedicalDisclaimer";
import {
  ACTIVITY_TYPE_OPTIONS,
  DURATION_HINT,
  RPE_MINDFUL_PROMPT,
  RPE_SCALE_TICKS,
  type ActivityType,
} from "@/lib/clinical/activityTypes";
import type { PostSaveFeedbackView } from "@/lib/clinical/postSaveFeedback";
import { saveSessionFeedback } from "@/lib/actions";
import { getTodayDateStr } from "@/lib/readinessHistory";
import { appendSessionFeedbackDraft } from "@/lib/sessionFeedback";
import { useRequireAuth } from "@/lib/useRequireAuth";

const DEFAULT_DURATION_MIN = 90;

export default function SessionFeedbackPage() {
  const { currentUser, isMounted } = useRequireAuth();
  const router = useRouter();
  const [activityType, setActivityType] = useState<ActivityType>("batting");
  const [sessionRpe, setSessionRpe] = useState(5);
  const [durationMin, setDurationMin] = useState(DEFAULT_DURATION_MIN);
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "local">(
    "idle"
  );
  const [view, setView] = useState<PostSaveFeedbackView | null>(null);

  useEffect(() => {
    if (!isMounted || !currentUser) return;
    if (currentUser.role === "coach") router.replace("/coach");
  }, [isMounted, currentUser, router]);

  const handleSubmit = async () => {
    if (!currentUser || status === "saving") return;
    setStatus("saving");
    const date = getTodayDateStr();
    const noteTrimmed = note.trim() ? note.trim().slice(0, 200) : null;
    const res = await saveSessionFeedback({
      playerId: currentUser.playerId,
      date,
      activityType,
      sessionRpe,
      durationMin,
      note: noteTrimmed,
    });
    if (res.success) {
      setStatus("saved");
      setView(res.view);
    } else {
      console.error("云端被拒:", res.error);
      appendSessionFeedbackDraft({
        playerId: currentUser.playerId,
        playerName: currentUser.playerName,
        date,
        activityType,
        sessionRpe,
        durationMin,
        note: noteTrimmed,
      });
      setStatus("local");
      window.alert("云端同步失败，已保存为本地草稿。");
    }
  };

  if (!isMounted || !currentUser || currentUser.role === "coach") return null;
  const rpeTip = RPE_SCALE_TICKS.find((t) => t.value === sessionRpe)?.label;

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
        </div>
        <MedicalDisclaimer />
        <div className="flex flex-col gap-2 border border-zinc-200 p-4">
          <label className="text-xs uppercase text-gray-500">活动类型</label>
          <div className="flex flex-wrap gap-1">
            {ACTIVITY_TYPE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setActivityType(opt.value)}
                className={`border px-3 py-1.5 text-xs ${
                  activityType === opt.value
                    ? "border-zinc-900 bg-zinc-900 text-white"
                    : "border-zinc-300 text-zinc-600"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-2 border border-zinc-200 p-4">
          <label className="text-xs uppercase text-gray-500">
            主观运动强度 (RPE 1–10)
          </label>
          <p className="text-xs leading-relaxed text-zinc-500">
            {RPE_MINDFUL_PROMPT}
          </p>
          <input
            type="range"
            min={1}
            max={10}
            step={1}
            value={sessionRpe}
            onChange={(e) => setSessionRpe(Number(e.target.value))}
            className="accent-zinc-900"
          />
          <span className="text-right font-mono text-sm text-zinc-900">
            {sessionRpe}
            {rpeTip ? ` · ${rpeTip}` : ""}
          </span>
        </div>
        <div className="flex flex-col gap-2 border border-zinc-200 p-4">
          <label className="text-xs uppercase text-gray-500">时长（分钟）</label>
          <p className="text-xs leading-relaxed text-zinc-500">{DURATION_HINT}</p>
          <input
            type="number"
            min={1}
            max={360}
            value={durationMin}
            onChange={(e) => setDurationMin(Number(e.target.value))}
            className="border border-zinc-300 px-3 py-2 font-mono text-sm"
          />
        </div>
        <div className="flex flex-col gap-2 border border-zinc-200 p-4">
          <label className="text-xs uppercase text-gray-500">
            私密备注（仅教练可见，可选）
          </label>
          <textarea
            maxLength={200}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="min-h-20 border border-zinc-300 px-3 py-2 text-sm"
          />
        </div>
        <button
          type="button"
          disabled={status === "saving"}
          onClick={() => void handleSubmit()}
          className="bg-black py-2 text-sm text-white hover:bg-zinc-800 disabled:bg-zinc-300"
        >
          {status === "saving" ? "提交中…" : "提交训后反馈"}
        </button>
        {view && (
          <div className="flex flex-col gap-2 border-2 border-zinc-900 bg-white p-4">
            <p className="text-sm text-zinc-700">{view.sessionLine}</p>
            <p className="font-mono text-lg">负荷 {view.sessionLoad}</p>
            {view.sessionLoadInsufficient ? (
              <p className="text-sm text-zinc-500">
                {view.sessionLoadInsufficientText}
              </p>
            ) : (
              view.sessionLoadExplain && (
                <div className="text-sm leading-relaxed text-zinc-700">
                  <p>{view.sessionLoadExplain.mainLine}</p>
                  {view.sessionLoadExplain.detailLine && (
                    <p className="mt-1 text-xs text-zinc-500">
                      {view.sessionLoadExplain.detailLine}
                    </p>
                  )}
                </div>
              )
            )}
            {view.dailyVisible && (
              <div className="border-t border-zinc-200 pt-2 text-sm text-zinc-700">
                <p>{view.dailyCountLine}</p>
                <p>{view.dailyTotalLine}</p>
                {view.dailyLoadInsufficient ? (
                  <p className="text-zinc-500">{view.dailyLoadInsufficientText}</p>
                ) : (
                  view.dailyLoadExplain && (
                    <>
                      <p>{view.dailyLoadExplain.mainLine}</p>
                      {view.dailyLoadExplain.detailLine && (
                        <p className="text-xs text-zinc-500">
                          {view.dailyLoadExplain.detailLine}
                        </p>
                      )}
                    </>
                  )
                )}
              </div>
            )}
            {view.preContextVisible && (
              <p className="whitespace-pre-line text-sm text-amber-800">
                {view.preContextText}
              </p>
            )}
            {view.injuryContextVisible && (
              <p className="text-sm text-zinc-700">
                {view.injuryContextText}{" "}
                <Link href="/prehab" className="underline">
                  运动损伤
                </Link>
              </p>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
