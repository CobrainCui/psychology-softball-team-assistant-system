"use client";

import { useEffect, useState } from "react";
import { type Scale5 } from "@/lib/clinical/preDimensions";
import { buildPreFeedback, type PreFeedbackResult } from "@/lib/clinical/preQuadrant";
import { buildCycleAssessmentBundle } from "@/lib/clinical/buildCycleAssessment";
import type { CycleGuidance } from "@/lib/clinical/cycleGuidance";
import { getTodayDateStr } from "@/lib/dateOnly";
import {
  removeReadinessEntry,
  upsertReadinessEntry,
  type ReadinessHistoryEntry,
} from "@/lib/readinessHistory";
import {
  consentToCycleTracking,
  deletePeriodStartEvent,
  getCycleProfile,
  recordPeriodStart,
  updateCycleProfileSettings,
  updatePeriodStartEvent,
} from "@/lib/cycleActions";
import {
  deleteReadinessAssessment,
  getReadinessHistory,
  saveReadinessAssessment,
} from "@/lib/status/readinessActions";
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
import type { SessionUser } from "@/lib/auth/types";

export type AssessmentResultView = {
  feedback: PreFeedbackResult;
  cyclePhaseLabel: string | null;
  cycleGuidance: CycleGuidance | null;
  cycleConfidence: string | null;
  showAclCues: boolean;
  showFemaleRedFlags: boolean;
  redsReasons: string[];
};

export function useAssessmentPage(currentUser: SessionUser | null, isMounted: boolean) {
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
  const [hasTodayCheck, setHasTodayCheck] = useState(false);
  const [result, setResult] = useState<AssessmentResultView | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!isMounted || !currentUser) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setIsLoadingHistory(true);
      if (currentUser.gender === "female" && currentUser.playerId) {
        setPeriodStartDate(getPeriodStartDate(currentUser.playerId));
      }
      void (async () => {
      const readinessRes = await getReadinessHistory();
      if (cancelled) return;
      if (!readinessRes.success) {
        console.error("云端被拒:", readinessRes.error);
        setHistory([]);
        setHasTodayCheck(false);
      } else {
        setHistory(readinessRes.history);
        const today = getTodayDateStr();
        const todayEntry = readinessRes.history.find((item) => item.date === today);
        if (todayEntry) {
          setSleep(todayEntry.sleep);
          setStress(todayEntry.stress);
          setFatigue(todayEntry.fatigue);
          setSoreness(todayEntry.soreness);
          setWillingness(todayEntry.willingness);
          setHasTodayCheck(true);
        } else {
          setHasTodayCheck(false);
        }
      }
      if (currentUser.gender === "female") {
        const cycleRes = await getCycleProfile();
        if (!cancelled && cycleRes.success) {
          setCycleProfile(cycleRes.profile);
          if (cycleRes.profile?.lastPeriodStart && currentUser.playerId) {
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
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [isMounted, currentUser]);

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
      if (!currentUser?.playerId) return;
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
        setNotice("云端打卡成功");
        setHasTodayCheck(true);
      } else {
        console.error("云端被拒:", res.error);
        setNotice("云端同步失败，已保存为本地草稿。");
        upsertReadinessEntry(entry);
        setHasTodayCheck(true);
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
      sharingLevel,
      seedPeriodStart: periodStartDate || undefined,
    });
    setConsentBusy(false);
    if (!res.success) {
      setNotice(res.error);
      return;
    }
    setCycleProfile(res.profile);
  };

  const handleDisableTracking = async () => {
    if (!currentUser) return;
    const res = await updateCycleProfileSettings({
      trackingEnabled: false,
    });
    if (!res.success) {
      setNotice(res.error);
      return;
    }
    setCycleProfile(res.profile);
  };

  const handleDeleteToday = async () => {
    if (!currentUser) return;
    const date = getTodayDateStr();
    const res = await deleteReadinessAssessment({
      date,
    });
    if (!res.success && res.error !== "没有今日评估记录") {
      console.error("云端被拒:", res.error);
      setNotice(res.error);
      return;
    }
    if (!currentUser?.playerId) return;
    const playerId = currentUser.playerId;
    removeReadinessEntry(playerId, date);
    setHistory((prev) =>
      prev.filter(
        (item) =>
          !(item.playerId === currentUser.playerId && item.date === date)
      )
    );
    setHasTodayCheck(false);
    setResult(null);
  };

  const applyCycleProfile = (profile: NonNullable<typeof cycleProfile>) => {
    setCycleProfile(profile);
    if (profile.lastPeriodStart && currentUser?.playerId) {
      setPeriodStartDate(profile.lastPeriodStart);
      persistPeriodStartDate(currentUser.playerId, profile.lastPeriodStart);
    }
  };

  const handleRecordPeriodStart = async () => {
    if (!currentUser?.playerId || !cycleTracking || !periodStartDate) return;
    const playerId = currentUser.playerId;
    persistPeriodStartDate(playerId, periodStartDate);
    const res = await recordPeriodStart({
      date: periodStartDate,
      crampsScore,
    });
    if (!res.success) {
      setNotice(res.error);
      return;
    }
    applyCycleProfile(res.profile);
  };

  const handleUpdatePeriodEvent = async (
    eventId: string,
    patch: { date?: string; crampsScore?: number | null }
  ) => {
    if (!currentUser) return;
    const res = await updatePeriodStartEvent({
      eventId,
      ...patch,
    });
    if (!res.success) {
      setNotice(res.error);
      return;
    }
    applyCycleProfile(res.profile);
  };

  const handleDeletePeriodEvent = async (eventId: string) => {
    if (!currentUser) return;
    const res = await deletePeriodStartEvent({
      eventId,
    });
    if (!res.success) {
      setNotice(res.error);
      return;
    }
    applyCycleProfile(res.profile);
    if (!res.profile.lastPeriodStart) {
      if (currentUser?.playerId) persistPeriodStartDate(currentUser.playerId, "");
      setPeriodStartDate("");
    }
  };

  const handlePeriodDateChange = (next: string) => {
    setPeriodStartDate(next);
    if (currentUser?.playerId) persistPeriodStartDate(currentUser.playerId, next);
  };

  const patchCycleSettings = async (
    patch: Parameters<typeof updateCycleProfileSettings>[0]
  ) => {
    if (!currentUser) return;
    const res = await updateCycleProfileSettings(patch);
    if (res.success) setCycleProfile(res.profile);
    else setNotice(res.error);
  };

  return {
    sleep,
    dimSetters,
    dimValues,
    periodStartDate,
    setPeriodStartDate,
    persistPeriodStartDate,
    cycleIrregular,
    setCycleIrregular,
    cycleProfile,
    crampsScore,
    setCrampsScore,
    cycleEnergy,
    setCycleEnergy,
    cycleMood,
    setCycleMood,
    consentBusy,
    isLoadingHistory,
    hasTodayCheck,
    result,
    notice,
    isFemale,
    cycleTracking,
    handleGenerate,
    handleConsent,
    handleDisableTracking,
    handleDeleteToday,
    handleRecordPeriodStart,
    handleUpdatePeriodEvent,
    handleDeletePeriodEvent,
    handlePeriodDateChange,
    patchCycleSettings,
  };
}
