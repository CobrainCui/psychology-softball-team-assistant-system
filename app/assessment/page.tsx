"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRequireAuth } from "@/lib/useRequireAuth";
import MedicalDisclaimer from "@/components/MedicalDisclaimer";
import { BatteryDriveChart } from "@/components/status/BatteryDriveChart";
import { ScaleSlider } from "@/components/status/ScaleSlider";
import {
  CycleConsentPanel,
  CycleResultExtras,
  CycleTrackingPanel,
} from "@/components/status/CyclePanel";
import { PRE_DIMENSIONS, PRE_SCAN_PROMPT, type Scale5 } from "@/lib/clinical/preDimensions";
import { buildPreFeedback, type PreFeedbackResult } from "@/lib/clinical/preQuadrant";
import { buildCycleAssessmentBundle } from "@/lib/clinical/buildCycleAssessment";
import type { CycleGuidance } from "@/lib/clinical/cycleGuidance";
import {
  getTodayDateStr,
  upsertReadinessEntry,
  type ReadinessHistoryEntry,
} from "@/lib/readinessHistory";
import {
  consentToCycleTracking,
  getCycleProfile,
  getReadinessHistory,
  saveReadinessAssessment,
  updateCycleProfileSettings,
  recordPeriodStart,
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

type ResultView = {
  feedback: PreFeedbackResult;
  cyclePhaseLabel: string | null;
  cycleGuidance: CycleGuidance | null;
  cycleConfidence: string | null;
  showAclCues: boolean;
  showFemaleRedFlags: boolean;
  redsReasons: string[];
};

export default function AssessmentPage() {
  const { currentUser, isMounted } = useRequireAuth();
  const [sleep, setSleep] = useState<Scale5>(3);
  const [stress, setStress] = useState<Scale5>(3);
  const [fatigue, setFatigue] = useState<Scale5>(3);
  const [soreness, setSoreness] = useState<Scale5>(3);
  const [willingness, setWillingness] = useState<Scale5>(3);
  const [periodStartDate, setPeriodStartDate] = useState("");
  const [cycleIrregular, setCycleIrregular] = useState(false);
  const [cycleProfile, setCycleProfile] = useState<CycleProfileDto | null>(null);
  const [crampsScore, setCrampsScore] = useState(0);
  const [cycleEnergy, setCycleEnergy] = useState<CycleEnergyLevel | null>(null);
  const [cycleMood, setCycleMood] = useState<CycleMoodLevel | null>(null);
  const [consentBusy, setConsentBusy] = useState(false);
  const [history, setHistory] = useState<ReadinessHistoryEntry[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [result, setResult] = useState<ResultView | null>(null);

  useEffect(() => {
    if (!isMounted || !currentUser) return;
    let cancelled = false;
    setIsLoadingHistory(true);
    if (currentUser.gender === "female") {
      setPeriodStartDate(getPeriodStartDate(currentUser.playerId));
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

  const dimSetters: Record<string, (n: Scale5) => void> = {
    sleep: setSleep,
    stress: setStress,
    fatigue: setFatigue,
    soreness: setSoreness,
    willingness: setWillingness,
  };
  const dimValues: Record<string, Scale5> = {
    sleep,
    stress,
    fatigue,
    soreness,
    willingness,
  };

  const resolveCycleBundle = () =>
    buildCycleAssessmentBundle({
      profile: isFemale ? cycleProfile : null,
      periodStartDate,
      symptoms: { crampsScore, cycleEnergy, cycleMood, cycleIrregular },
      fatigueScore: fatigue,
      sorenessScore: soreness,
      recentSleep: history.slice(0, 30).map((h) => h.sleep),
      recentFatigue: history.slice(0, 30).map((h) => h.fatigue),
    });

  const handleGenerate = () => {
    void (async () => {
      const cycleBundle = resolveCycleBundle();
      const inMenstrualPeriod = Boolean(cycleBundle.phase?.isMenstrual);
      const feedback = buildPreFeedback({
        input: { sleep, stress, fatigue, soreness, willingness },
        inMenstrualPeriod,
      });
      if (!currentUser) return;
      const entry: ReadinessHistoryEntry = {
        playerId: currentUser.playerId,
        date: getTodayDateStr(),
        sleep,
        stress,
        fatigue,
        soreness,
        willingness,
        physicalBattery: feedback.physicalBattery,
        mentalDrive: feedback.mentalDrive,
        quadrant: feedback.quadrant,
      };
      const res = await saveReadinessAssessment({
        ...entry,
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
      });
      if (res.success) {
        window.alert("云端打卡成功！");
      } else {
        console.error("cloud denied:", res.error);
        window.alert("云端同步失败，已保存为本地草稿。");
        upsertReadinessEntry(entry);
      }
      setHistory((prev) => {
        const withoutSameDay = prev.filter(
          (item) =>
            !(item.playerId === entry.playerId && item.date === entry.date)
        );
        return [entry, ...withoutSameDay].sort((a, b) =>
          b.date.localeCompare(a.date)
        );
      });
      setResult({
        feedback,
        cyclePhaseLabel: cycleBundle.phase?.label ?? null,
        cycleGuidance: cycleBundle.guidance,
        cycleConfidence: cycleBundle.phase?.confidence ?? null,
        showAclCues: cycleBundle.showAclCues,
        showFemaleRedFlags: cycleBundle.showFemaleRedFlags,
        redsReasons: cycleBundle.reds.reasons,
      });
    })();
  };

  const handleConsent = async (shareWithCoach: boolean) => {
    if (!currentUser) return;
    setConsentBusy(true);
    const sharingLevel: CycleSharingLevel = shareWithCoach ? "load_only" : "none";
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

  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 p-6">
      <main className="flex w-full max-w-2xl flex-col gap-4">
        <div className="text-center">
          <h1 className="text-sm font-medium tracking-wide text-zinc-500">
            综合状态评估 · 四象限
          </h1>
          <p className="mt-1 text-xs text-zinc-400">
            当前球员：{currentUser.playerName}
          </p>
        </div>
        <MedicalDisclaimer />
        <div className="border border-zinc-200 bg-white px-4 py-3 text-xs leading-relaxed text-zinc-600">
          有关节/韧带局部剧痛或旧伤不适？请前往{" "}
          <Link href="/prehab" className="underline underline-offset-2 hover:text-zinc-900">
            运动损伤
          </Link>
          。本页只评估身体电量与心理动力，不采集伤病。
        </div>
        <p className="text-sm leading-relaxed text-zinc-600">{PRE_SCAN_PROMPT}</p>
        {PRE_DIMENSIONS.map((dim) => (
          <ScaleSlider
            key={dim.field}
            label={dim.label}
            description={dim.description}
            hint1={dim.hint1}
            hint3={dim.hint3}
            hint5={dim.hint5}
            value={dimValues[dim.field]!}
            onChange={(n) => dimSetters[dim.field]!(n as Scale5)}
          />
        ))}
        {isFemale && (
          <div className="flex flex-col gap-3 border border-zinc-200 p-4">
            <label className="text-xs uppercase text-gray-500">
              生理周期监测（自愿）
            </label>
            {!cycleTracking ? (
              <CycleConsentPanel
                periodStartDate={periodStartDate}
                onPeriodStartDate={(next) => {
                  setPeriodStartDate(next);
                  if (currentUser) {
                    persistPeriodStartDate(currentUser.playerId, next);
                  }
                }}
                consentBusy={consentBusy}
                onConsent={(share) => void handleConsent(share)}
              />
            ) : (
              <CycleTrackingPanel
                cycleProfile={cycleProfile}
                periodStartDate={periodStartDate}
                crampsScore={crampsScore}
                cycleEnergy={cycleEnergy}
                cycleMood={cycleMood}
                cycleIrregular={cycleIrregular}
                onPeriodDateChange={(next) => void handlePeriodDateChange(next)}
                onCramps={setCrampsScore}
                onEnergy={setCycleEnergy}
                onMood={setCycleMood}
                onIrregular={setCycleIrregular}
                onPatch={(patch) => void patchCycleSettings(patch)}
                onDisable={() => void handleDisableTracking()}
              />
            )}
          </div>
        )}
        <button
          onClick={handleGenerate}
          disabled={isLoadingHistory}
          className="bg-black py-2 text-sm text-white transition-colors hover:bg-zinc-800 disabled:bg-zinc-300 disabled:text-zinc-500"
        >
          生成今日四象限反馈
        </button>
        {result && (
          <div className="flex flex-col gap-3 border-2 border-zinc-900 bg-white p-4">
            <CycleResultExtras
              cyclePhaseLabel={result.cyclePhaseLabel}
              cycleConfidence={result.cycleConfidence}
              cycleGuidance={result.cycleGuidance}
              showAclCues={result.showAclCues}
              showFemaleRedFlags={result.showFemaleRedFlags}
              redsReasons={result.redsReasons}
            />
            <h2 className="text-lg font-medium text-zinc-900">
              {result.feedback.title}
            </h2>
            <p className="font-mono text-xs text-zinc-500">
              电量 {result.feedback.physicalBattery.toFixed(1)} · 动力{" "}
              {result.feedback.mentalDrive}
            </p>
            <BatteryDriveChart
              physicalBattery={result.feedback.physicalBattery}
              mentalDrive={result.feedback.mentalDrive}
            />
            <p className="whitespace-pre-line text-sm leading-relaxed text-zinc-700">
              {result.feedback.narrative}
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
