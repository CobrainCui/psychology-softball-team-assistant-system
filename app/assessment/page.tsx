"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRequireAuth } from "@/lib/useRequireAuth";
import MedicalDisclaimer from "@/components/MedicalDisclaimer";
import {
  ACL_PREVENTION_CUES,
  CYCLE_CONSENT_POINTS,
  FEMALE_HEALTH_RED_FLAGS,
  type CycleGuidance,
} from "@/lib/clinical/cycleGuidance";
import { buildCycleAssessmentBundle } from "@/lib/clinical/buildCycleAssessment";
import {
  computeReadiness,
  loadBandTone,
  type LoadBand,
  type ReadinessDimensionBreakdown,
} from "@/lib/clinical/readinessScore";
import {
  getTodayDateStr,
  upsertReadinessEntry,
  type ReadinessHistoryEntry,
  type SleepQuality,
} from "@/lib/readinessHistory";
import {
  consentToCycleTracking,
  getCycleProfile,
  getReadinessHistory,
  recordPeriodStart,
  saveReadinessAssessment,
  updateCycleProfileSettings,
} from "@/lib/actions";
import type {
  CycleEnergyLevel,
  CycleMoodLevel,
  CycleProfileDto,
  CycleSharingLevel,
} from "@/lib/cycleTypes";
import {
  getPeriodStartDate,
  setPeriodStartDate as persistPeriodStartDate,
} from "@/lib/periodStart";

const SLEEP_OPTIONS: { value: SleepQuality; label: string }[] = [
  { value: "good", label: "极佳 (8h 以上)" },
  { value: "normal", label: "普通 (6-8h)" },
  { value: "bad", label: "糟糕 (<6h / 失眠)" },
];

const BAND_CLASSES: Record<ReturnType<typeof loadBandTone>, string> = {
  red: "border-red-600 bg-black text-white",
  yellow: "border-amber-500 bg-white text-zinc-900",
  green: "border-zinc-900 bg-white text-zinc-900",
};

interface ReadinessResult {
  breakdown: ReadinessDimensionBreakdown;
  loadBand: LoadBand;
  cyclePhaseLabel: string | null;
  cycleGuidance: CycleGuidance | null;
  cycleConfidence: string | null;
  showAclCues: boolean;
  showFemaleRedFlags: boolean;
  redsReasons: string[];
}

export default function AssessmentPage() {
  const { currentUser, isMounted } = useRequireAuth();

  const [sleepQuality, setSleepQuality] = useState<SleepQuality>("normal");
  const [stressScore, setStressScore] = useState(3);
  const [fatigueScore, setFatigueScore] = useState(3);
  const [sorenessScore, setSorenessScore] = useState(3);
  const [periodStartDate, setPeriodStartDate] = useState("");
  const [cycleIrregular, setCycleIrregular] = useState(false);
  const [cycleProfile, setCycleProfile] = useState<CycleProfileDto | null>(
    null
  );
  const [crampsScore, setCrampsScore] = useState(0);
  const [cycleEnergy, setCycleEnergy] = useState<CycleEnergyLevel | null>(null);
  const [cycleMood, setCycleMood] = useState<CycleMoodLevel | null>(null);
  const [consentBusy, setConsentBusy] = useState(false);

  const [history, setHistory] = useState<ReadinessHistoryEntry[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [result, setResult] = useState<ReadinessResult | null>(null);
  const [showBreakdown, setShowBreakdown] = useState(false);

  useEffect(() => {
    if (!isMounted || !currentUser) return;
    let cancelled = false;
    setIsLoadingHistory(true);
    if (currentUser.gender === "female") {
      const localStart = getPeriodStartDate(currentUser.playerId);
      setPeriodStartDate(localStart);
    }

    (async () => {
      const readinessRes = await getReadinessHistory(currentUser.playerId);
      if (cancelled) return;
      if (!readinessRes.success) {
        console.error("cloud denied:", readinessRes.error);
        setHistory([]);
      } else {
        setHistory(readinessRes.history);
      }

      if (currentUser.gender === "female") {
        const cycleRes = await getCycleProfile(currentUser.playerId);
        if (!cancelled && cycleRes.success) {
          setCycleProfile(cycleRes.profile);
          if (cycleRes.profile?.lastPeriodStart) {
            setPeriodStartDate(cycleRes.profile.lastPeriodStart);
            persistPeriodStartDate(
              currentUser.playerId,
              cycleRes.profile.lastPeriodStart
            );
          }
        }
      }

      if (!cancelled) setIsLoadingHistory(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [isMounted, currentUser?.playerId, currentUser?.gender]);

  const isFemale = isMounted && currentUser?.gender === "female";
  const cycleTracking =
    Boolean(cycleProfile?.consentAt) && Boolean(cycleProfile?.trackingEnabled);

  const resolveCycleBundle = () =>
    buildCycleAssessmentBundle({
      profile: isFemale ? cycleProfile : null,
      periodStartDate,
      symptoms: {
        crampsScore,
        cycleEnergy,
        cycleMood,
        cycleIrregular,
      },
      fatigueScore,
      sorenessScore,
      recentSleep: history
        .slice(0, 30)
        .map((h) => h.sleepQuality)
        .filter((s): s is SleepQuality => s != null),
      recentFatigue: history
        .slice(0, 30)
        .map((h) => h.fatigueScore)
        .filter((n): n is number => typeof n === "number"),
    });

  // ????????? -> Hooper ???? -> ????? -> ????????
  const handleGenerate = () => {
    void (async () => {
      const cycleBundle = resolveCycleBundle();
      const {
        phase,
        guidance: cycleGuidance,
        penalty,
        reds,
        showAclCues,
        showFemaleRedFlags,
      } = cycleBundle;

      const recentScores = history
        .slice(0, 14)
        .map((h) => h.readinessScore)
        .filter((n): n is number => typeof n === "number");

      const breakdown = computeReadiness({
        sleepQuality,
        stressScore,
        fatigueScore,
        sorenessScore,
        cyclePenalty: penalty,
        recentScores,
      });

      await archiveToday(breakdown.readinessScore, cycleBundle);

      setShowBreakdown(false);
      setResult({
        breakdown,
        loadBand: breakdown.loadBand,
        cyclePhaseLabel: phase?.label ?? null,
        cycleGuidance,
        cycleConfidence: phase?.confidence ?? null,
        showAclCues,
        showFemaleRedFlags,
        redsReasons: reds.reasons,
      });
    })();
  };

  const archiveToday = async (
    score: number,
    cycleBundle = resolveCycleBundle()
  ) => {
    if (!currentUser) return;

    const entry: ReadinessHistoryEntry = {
      playerId: currentUser.playerId,
      date: getTodayDateStr(),
      readinessScore: score,
      hasNewInjury: false,
      injuryPart: null,
      injuryScore: 0,
      probeFeedback: null,
      sleepQuality,
      stressScore,
      fatigueScore,
      sorenessScore,
    };

    const payload = {
      ...entry,
      sleepQuality,
      stressScore,
      fatigueScore,
      sorenessScore,
      cycleDay: cycleBundle.phase?.dayOfCycle ?? null,
      cyclePhaseCode: cycleBundle.phase?.hidePhaseLabels
        ? null
        : (cycleBundle.phase?.code ?? null),
      cycleConfidence: cycleBundle.phase?.confidence ?? null,
      physiologicalLoadTag: cycleBundle.loadTag,
      crampsScore: cycleTracking ? crampsScore : null,
      cycleEnergy: cycleTracking ? cycleEnergy : null,
      cycleMood: cycleTracking ? cycleMood : null,
      cycleIrregularFlag: cycleTracking ? cycleIrregular : false,
    };

    const res = await saveReadinessAssessment(payload);
    if (res.success) {
      window.alert("云端打卡成功！");
      setHistory((prev) => {
        const withoutSameDay = prev.filter(
          (item) =>
            !(item.playerId === entry.playerId && item.date === entry.date)
        );
        return [entry, ...withoutSameDay].sort((a, b) =>
          b.date.localeCompare(a.date)
        );
      });
    } else {
      console.error("cloud denied:", res.error);
      window.alert(
        "云端同步失败，已保存为本地草稿。"
      );
      upsertReadinessEntry(entry);
      setHistory((prev) => {
        const withoutSameDay = prev.filter(
          (item) =>
            !(item.playerId === entry.playerId && item.date === entry.date)
        );
        return [entry, ...withoutSameDay].sort((a, b) =>
          b.date.localeCompare(a.date)
        );
      });
    }
  };

  const handleConsent = async (shareWithCoach: boolean) => {
    if (!currentUser) return;
    setConsentBusy(true);
    const sharingLevel: CycleSharingLevel = shareWithCoach
      ? "load_only"
      : "none";
    const res = await consentToCycleTracking({
      playerId: currentUser.playerId,
      sharingLevel,
      seedPeriodStart: periodStartDate || undefined,
    });
    setConsentBusy(false);
    if (!res.success) {
      window.alert(res.error);
      return;
    }
    setCycleProfile(res.profile);
  };

  const handleDisableTracking = async () => {
    if (!currentUser) return;
    const res = await updateCycleProfileSettings({
      playerId: currentUser.playerId,
      trackingEnabled: false,
    });
    if (!res.success) {
      window.alert(res.error);
      return;
    }
    setCycleProfile(res.profile);
  };

  const handlePeriodDateChange = async (next: string) => {
    setPeriodStartDate(next);
    if (!currentUser) return;
    persistPeriodStartDate(currentUser.playerId, next);
    if (!cycleTracking || !next) return;
    const res = await recordPeriodStart({
      playerId: currentUser.playerId,
      date: next,
      crampsScore,
    });
    if (res.success) setCycleProfile(res.profile);
  };

  const patchCycleSettings = async (
    patch: Omit<Parameters<typeof updateCycleProfileSettings>[0], "playerId">
  ) => {
    if (!currentUser) return;
    const res = await updateCycleProfileSettings({
      ...patch,
      playerId: currentUser.playerId,
    });
    if (res.success) setCycleProfile(res.profile);
    else window.alert(res.error);
  };

  if (!isMounted || !currentUser) return null;

  const canGenerate = !isLoadingHistory;
  const tone = result ? loadBandTone(result.loadBand.id) : null;

  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 p-6">
      <main className="flex w-full max-w-2xl flex-col gap-4">
        <div className="text-center">
          <h1 className="text-sm font-medium tracking-wide text-zinc-500">
            {"综合状态评估 · Readiness"}
          </h1>
          <p className="mt-1 text-xs text-zinc-400">
            {"当前球员："}
            {currentUser.playerName}
          </p>
        </div>

        <MedicalDisclaimer />

        <div className="border border-zinc-200 bg-white px-4 py-3 text-xs leading-relaxed text-zinc-600">
          {
            "有关节/韧带局部剧痛或旧伤不适？请前往 "
          }
          <Link
            href="/prehab"
            className="underline underline-offset-2 hover:text-zinc-900"
          >
            {"运动损伤"}
          </Link>
          {
            "。本页只评估体能准备度，不采集伤病。"
          }
        </div>

        <div className="flex flex-col gap-2 border border-zinc-200 p-4">
          <label className="text-xs uppercase text-gray-500">
            {"睡眠与恢复"}
          </label>
          <div className="flex gap-1">
            {SLEEP_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setSleepQuality(option.value)}
                className={`flex-1 border py-1.5 text-xs transition-colors ${
                  sleepQuality === option.value
                    ? "border-zinc-900 bg-zinc-900 text-white"
                    : "border-zinc-300 text-zinc-500 hover:bg-zinc-100"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="flex flex-col gap-2 border border-zinc-200 p-4">
            <label className="text-xs uppercase text-gray-500">
              {
                "心理压力 (0 无压力 / 10 极度焦虑)"
              }
            </label>
            <input
              type="range"
              min={0}
              max={10}
              step={1}
              value={stressScore}
              onChange={(e) => setStressScore(Number(e.target.value))}
              className="accent-zinc-900"
            />
            <span className="text-right font-mono text-sm text-zinc-900">
              {stressScore}
            </span>
          </div>

          <div className="flex flex-col gap-2 border border-zinc-200 p-4">
            <label className="text-xs uppercase text-gray-500">
              {
                "身体疲劳度 (0 满格 / 10 极度疲劳)"
              }
            </label>
            <input
              type="range"
              min={0}
              max={10}
              step={1}
              value={fatigueScore}
              onChange={(e) => setFatigueScore(Number(e.target.value))}
              className="accent-zinc-900"
            />
            <span className="text-right font-mono text-sm text-zinc-900">
              {fatigueScore}
            </span>
          </div>

          <div className="flex flex-col gap-2 border border-zinc-200 p-4">
            <label className="text-xs uppercase text-gray-500">
              {
                "肌肉酸痛 (0 无酸 / 10 严重酸痛 · Hooper)"
              }
            </label>
            <input
              type="range"
              min={0}
              max={10}
              step={1}
              value={sorenessScore}
              onChange={(e) => setSorenessScore(Number(e.target.value))}
              className="accent-zinc-900"
            />
            <span className="text-right font-mono text-sm text-zinc-900">
              {sorenessScore}
            </span>
          </div>
        </div>

        {isFemale && (
          <div className="flex flex-col gap-3 border border-zinc-200 p-4">
            <label className="text-xs uppercase text-gray-500">
              {"生理周期监测（自愿）"}
            </label>

            {!cycleTracking ? (
              <div className="flex flex-col gap-2">
                <p className="text-xs leading-relaxed text-zinc-500">
                  {
                    "开启后用于个人负荷参考。不开启不影响准备度打卡与上场。"
                  }
                </p>
                <ul className="list-inside list-disc text-xs leading-relaxed text-zinc-500">
                  {CYCLE_CONSENT_POINTS.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-zinc-400">
                    {
                      "可选：上次经期开始日（可稍后填写）"
                    }
                  </span>
                  <input
                    type="date"
                    value={periodStartDate}
                    onChange={(e) => {
                      setPeriodStartDate(e.target.value);
                      if (currentUser) {
                        persistPeriodStartDate(
                          currentUser.playerId,
                          e.target.value
                        );
                      }
                    }}
                    className="border border-zinc-300 px-3 py-2 text-sm text-zinc-900"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={consentBusy}
                    onClick={() => void handleConsent(false)}
                    className="border border-zinc-900 bg-zinc-900 px-3 py-1.5 text-xs text-white disabled:bg-zinc-200 disabled:text-zinc-500 disabled:hover:bg-zinc-200"
                  >
                    {"同意并仅本人可见"}
                  </button>
                  <button
                    type="button"
                    disabled={consentBusy}
                    onClick={() => void handleConsent(true)}
                    className="border border-zinc-300 px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-100 disabled:bg-zinc-200 disabled:text-zinc-500 disabled:hover:bg-zinc-200"
                  >
                    {
                      "同意并分享脱敏负荷给教练"
                    }
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-zinc-400">
                    {"上次经期开始日"}
                  </span>
                  <input
                    type="date"
                    value={periodStartDate}
                    onChange={(e) => {
                      void handlePeriodDateChange(e.target.value);
                    }}
                    className="border border-zinc-300 px-3 py-2 text-sm text-zinc-900"
                  />
                </div>
                <p className="text-xs leading-relaxed text-zinc-400">
                  {"典型周期约 "}
                  {cycleProfile?.resolvedLengthDays ?? 28}
                  {" 天 · 置信度 "}
                  {cycleProfile?.confidence ?? "low"}
                  {cycleProfile?.highVariance
                    ? " · 波动偏大，阶段标签已降级"
                    : ""}
                  {cycleProfile?.hormonalContraception
                    ? " · 已标记激素避孕，以症状驱动为主"
                    : ""}
                </p>

                <div className="flex flex-col gap-2">
                  <span className="text-xs text-zinc-500">
                    {"今日痛经 (0 无 / 10 极重)"}
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={10}
                    step={1}
                    value={crampsScore}
                    onChange={(e) => setCrampsScore(Number(e.target.value))}
                    className="accent-zinc-900"
                  />
                  <span className="text-right font-mono text-sm text-zinc-900">
                    {crampsScore}
                  </span>
                </div>

                <div className="flex flex-col gap-1">
                  <span className="text-xs text-zinc-500">
                    {"今日能量"}
                  </span>
                  <div className="flex gap-1">
                    {(
                      [
                        ["low", "低"],
                        ["mid", "中"],
                        ["high", "高"],
                      ] as const
                    ).map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() =>
                          setCycleEnergy((prev) =>
                            prev === value ? null : value
                          )
                        }
                        className={`flex-1 border py-1.5 text-xs ${
                          cycleEnergy === value
                            ? "border-zinc-900 bg-zinc-900 text-white"
                            : "border-zinc-300 text-zinc-500"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <span className="text-xs text-zinc-500">
                    {"今日情绪（仅本人）"}
                  </span>
                  <div className="flex gap-1">
                    {(
                      [
                        ["steady", "平稳"],
                        ["irritable", "易烦"],
                        ["low", "低落"],
                      ] as const
                    ).map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() =>
                          setCycleMood((prev) =>
                            prev === value ? null : value
                          )
                        }
                        className={`flex-1 border py-1.5 text-xs ${
                          cycleMood === value
                            ? "border-zinc-900 bg-zinc-900 text-white"
                            : "border-zinc-300 text-zinc-500"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 border-t border-zinc-200 pt-3">
                  <span className="text-xs text-zinc-500">
                    {
                      "近 3 个月月经是否大致规律？"
                    }
                  </span>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => setCycleIrregular(false)}
                      className={`border px-3 py-1 text-xs transition-colors ${
                        !cycleIrregular
                          ? "border-zinc-900 bg-zinc-900 text-white"
                          : "border-zinc-300 text-zinc-500 hover:bg-zinc-100"
                      }`}
                    >
                      {"规律"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setCycleIrregular(true)}
                      className={`border px-3 py-1 text-xs transition-colors ${
                        cycleIrregular
                          ? "border-amber-600 bg-amber-600 text-white"
                          : "border-zinc-300 text-zinc-500 hover:bg-zinc-100"
                      }`}
                    >
                      {
                        "不规律/长期未来潮"
                      }
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 border-t border-zinc-200 pt-3">
                  <button
                    type="button"
                    onClick={() =>
                      void patchCycleSettings({
                        hormonalContraception:
                          !cycleProfile?.hormonalContraception,
                      })
                    }
                    className={`border px-3 py-1 text-xs ${
                      cycleProfile?.hormonalContraception
                        ? "border-zinc-900 bg-zinc-900 text-white"
                        : "border-zinc-300 text-zinc-600"
                    }`}
                  >
                    {
                      "激素避孕/无规律出血"
                    }
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      void patchCycleSettings({
                        sharingLevel:
                          cycleProfile?.sharingLevel === "none"
                            ? "load_only"
                            : "none",
                      })
                    }
                    className={`border px-3 py-1 text-xs ${
                      cycleProfile?.sharingLevel !== "none"
                        ? "border-zinc-900 bg-zinc-900 text-white"
                        : "border-zinc-300 text-zinc-600"
                    }`}
                  >
                    {cycleProfile?.sharingLevel !== "none"
                      ? "已分享脱敏负荷"
                      : "分享脱敏负荷给教练"}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      void patchCycleSettings({
                        bodyImageAnxietyOptIn:
                          !cycleProfile?.bodyImageAnxietyOptIn,
                      })
                    }
                    className={`border px-3 py-1 text-xs ${
                      cycleProfile?.bodyImageAnxietyOptIn
                        ? "border-amber-600 bg-amber-600 text-white"
                        : "border-zinc-300 text-zinc-600"
                    }`}
                  >
                    {
                      "饮食/体重持续焦虑（敏感·可选）"
                    }
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDisableTracking()}
                    className="border border-zinc-300 px-3 py-1 text-xs text-zinc-500"
                  >
                    {"关闭追踪"}
                  </button>
                </div>

                {cycleIrregular && (
                  <p className="text-xs leading-relaxed text-amber-700">
                    {
                      "提示：月经长期不规律可能与低能量可用性（RED-S）相关，建议优先提高能量摄入并转介专业医疗，而非仅靠减训硬撑。"
                    }
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        <button
          onClick={handleGenerate}
          disabled={!canGenerate}
          className="bg-black py-2 text-sm text-white transition-colors hover:bg-zinc-800 disabled:bg-zinc-300 disabled:text-zinc-500 disabled:hover:bg-zinc-300"
        >
          {"生成今日体能负荷建议"}
        </button>

        {result && tone && (
          <div className={`border-2 p-4 ${BAND_CLASSES[tone]}`}>
            <div className="flex flex-col gap-1 text-xs uppercase text-zinc-500">
              {result.cyclePhaseLabel && (
                <span>
                  {"推算生理阶段："}
                  {result.cyclePhaseLabel}
                  {result.cycleConfidence
                    ? ` · 置信度 ${result.cycleConfidence}`
                    : ""}
                </span>
              )}
              <span>
                {"负荷带："}
                {result.loadBand.label}
                {" · "}
                {result.loadBand.loadPercent}%
              </span>
            </div>

            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-xs uppercase text-zinc-500">
                {"今日 Readiness"}
              </span>
              <span className="font-mono text-3xl">
                {result.breakdown.readinessScore} / 100
              </span>
            </div>

            <button
              type="button"
              onClick={() => setShowBreakdown((v) => !v)}
              className="mt-3 border border-current/30 px-3 py-1.5 text-xs"
            >
              {showBreakdown
                ? "收起维度明细"
                : "展开维度明细"}
            </button>

            {showBreakdown && (
              <ul className="mt-2 space-y-1 border border-current/20 p-3 font-mono text-xs">
                <li>
                  {"睡眠 Hooper："}
                  {result.breakdown.sleepHooper}
                </li>
                <li>
                  {"压力 Hooper："}
                  {result.breakdown.stressHooper}
                </li>
                <li>
                  {"疲劳 Hooper："}
                  {result.breakdown.fatigueHooper}
                </li>
                <li>
                  {"酸痛 Hooper："}
                  {result.breakdown.sorenessHooper}
                </li>
                <li>
                  {"合计："}
                  {result.breakdown.hooperSum}
                  {"（4–28）"}
                </li>
                <li>
                  {"周期扣分："}
                  {result.breakdown.cyclePenalty}
                </li>
                <li>
                  {"基线降档："}
                  {result.breakdown.baselineAdjustment > 0
                    ? `是（降 ${result.breakdown.baselineAdjustment} 档）`
                    : "否"}
                </li>
              </ul>
            )}

            {result.cycleGuidance && (
              <div className="mt-4 border border-current/20 p-3">
                <p className="text-xs font-semibold uppercase text-zinc-500">
                  {"周期同步训练 · "}
                  {result.cycleGuidance.phaseLabel}
                </p>
                <p className="mt-1 text-sm leading-relaxed">
                  {result.cycleGuidance.energyHint}
                </p>
                <ul className="mt-2 list-inside list-disc text-sm leading-relaxed text-zinc-700">
                  {result.cycleGuidance.trainingFocus.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
                {result.cycleGuidance.cautions.length > 0 && (
                  <p className="mt-2 text-xs text-zinc-500">
                    {"注意："}
                    {result.cycleGuidance.cautions.join("；")}
                  </p>
                )}
                {result.cycleGuidance.nutritionHints.length > 0 && (
                  <p className="mt-1 text-xs text-zinc-500">
                    {"营养："}
                    {result.cycleGuidance.nutritionHints.join("；")}
                  </p>
                )}
              </div>
            )}

            {result.showAclCues && (
              <div className="mt-3 border border-amber-500 bg-amber-50 p-3 text-zinc-900">
                <p className="text-xs font-semibold uppercase text-amber-700">
                  {"排卵窗口 · ACL 预防清单"}
                </p>
                <ul className="mt-2 list-inside list-disc text-sm leading-relaxed">
                  {ACL_PREVENTION_CUES.map((cue) => (
                    <li key={cue}>{cue}</li>
                  ))}
                </ul>
              </div>
            )}

            {result.showFemaleRedFlags && (
              <div className="mt-3 border border-amber-600 p-3">
                <p className="text-xs font-semibold uppercase text-amber-800">
                  {
                    "女性健康早期警示（须转介，非诊断）"
                  }
                </p>
                {result.redsReasons.length > 0 && (
                  <ul className="mt-2 list-inside list-disc text-sm leading-relaxed">
                    {result.redsReasons.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                )}
                <ul className="mt-2 list-inside list-disc text-sm leading-relaxed text-zinc-700">
                  {FEMALE_HEALTH_RED_FLAGS.map((flag) => (
                    <li key={flag}>{flag}</li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-zinc-500">
                  {
                    "优先提高能量可用性并寻求专业医疗/营养支持，系统不会因此自动禁赛。"
                  }
                </p>
              </div>
            )}

            <div className="mt-4 flex flex-col gap-3">
              <div className="border border-current/30 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase text-zinc-500">
                    {"满垒球专项建议"}
                  </p>
                  <span className="font-mono text-sm">
                    {"负荷 "}
                    {result.loadBand.loadPercent}%
                  </span>
                </div>
                <ul className="mt-2 list-inside list-disc text-sm leading-relaxed">
                  {result.loadBand.focus.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>

              <div className="border border-red-500 p-3 text-zinc-900">
                <p className="text-xs font-semibold uppercase text-red-600">
                  {"绝对红线"}
                </p>
                <p className="mt-1 text-sm leading-relaxed">
                  {result.loadBand.redLine}
                </p>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
