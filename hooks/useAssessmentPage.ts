"use client";

import { useEffect, useState } from "react";
import { type Scale5 } from "@/lib/clinical/preDimensions";
import { buildPreFeedback, type PreFeedbackResult } from "@/lib/clinical/preQuadrant";
import { buildCycleAssessmentBundle } from "@/lib/clinical/buildCycleAssessment";
import type { CycleGuidance } from "@/lib/clinical/cycleGuidance";
import { getTeamTodayDateStr } from "@/lib/season/timeZone";
import {
  READINESS_DRAFT_SCHEMA_VERSION,
  removeReadinessEntry,
  toReadinessCloudSaveInput,
  upsertReadinessEntry,
  loadReadinessHistory,
  loadFailedReadinessHistory,
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
import { draftScopeFromUser } from "@/lib/scopedStorage";
import type { SessionUser } from "@/lib/auth/types";
import { useSyncOutbox } from "@/hooks/useSyncOutbox";
import { PENDING_SYNC_COPY } from "@/lib/syncOutbox";

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
  const [todaySync, setTodaySync] = useState<"none" | "cloud" | "local">("none");
  const [result, setResult] = useState<AssessmentResultView | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [failedLocal, setFailedLocal] = useState<ReadinessHistoryEntry[]>([]);

  const draftScope = draftScopeFromUser(currentUser);

  useSyncOutbox(draftScope, (result) => {
    setFailedLocal(loadFailedReadinessHistory(draftScope));
    const today = currentUser
      ? getTeamTodayDateStr(currentUser.teamTimeZone)
      : null;
    if (today && result.readinessSynced.includes(today)) {
      setTodaySync("cloud");
      setNotice("已同步到云端");
    }
  });

  // 推导步骤：accountId 变化则清空内存并从云端重载；经期日不以本地缓存为权威
  useEffect(() => {
    if (!isMounted || !currentUser) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setIsLoadingHistory(true);
      setPeriodStartDate("");
      setCycleProfile(null);
      setResult(null);
      void (async () => {
        const applyTodayCycle = (entry?: ReadinessHistoryEntry) => {
          setCrampsScore(entry?.crampsScore ?? 0);
          setCycleEnergy(entry?.cycleEnergy ?? null);
          setCycleMood(entry?.cycleMood ?? null);
          setCycleIrregular(Boolean(entry?.cycleIrregularFlag));
        };
        const readinessRes = await getReadinessHistory();
        if (cancelled) return;
        setFailedLocal(loadFailedReadinessHistory(draftScope));
        if (!readinessRes.success) {
          console.error("云端被拒:", readinessRes.error);
          const local = loadReadinessHistory(draftScope);
          const today = getTeamTodayDateStr(currentUser.teamTimeZone);
          const localToday = local.find(
            (item) =>
              item.playerId === currentUser.playerId && item.date === today
          );
          setHistory(local);
          if (localToday) {
            setSleep(localToday.sleep);
            setStress(localToday.stress);
            setFatigue(localToday.fatigue);
            setSoreness(localToday.soreness);
            setWillingness(localToday.willingness);
            applyTodayCycle(localToday);
            setTodaySync(
              localToday.syncStatus === "failed" ? "none" : "local"
            );
          } else {
            applyTodayCycle();
            setTodaySync("none");
          }
        } else {
          setHistory(readinessRes.history);
          const today = getTeamTodayDateStr(currentUser.teamTimeZone);
          const todayEntry = readinessRes.history.find((item) => item.date === today);
          const localToday = loadReadinessHistory(draftScope).find(
            (item) =>
              item.playerId === currentUser.playerId && item.date === today
          );
          if (todayEntry) {
            setSleep(todayEntry.sleep);
            setStress(todayEntry.stress);
            setFatigue(todayEntry.fatigue);
            setSoreness(todayEntry.soreness);
            setWillingness(todayEntry.willingness);
            applyTodayCycle(todayEntry);
            setTodaySync("cloud");
            if (localToday && currentUser.playerId) {
              removeReadinessEntry(draftScope, currentUser.playerId, today);
            }
          } else if (localToday) {
            setSleep(localToday.sleep);
            setStress(localToday.stress);
            setFatigue(localToday.fatigue);
            setSoreness(localToday.soreness);
            setWillingness(localToday.willingness);
            applyTodayCycle(localToday);
            setTodaySync(
              localToday.syncStatus === "failed" ? "none" : "local"
            );
            setHistory((prev) => {
              const without = prev.filter(
                (item) =>
                  !(
                    item.playerId === localToday.playerId &&
                    item.date === localToday.date
                  )
              );
              return [localToday, ...without].sort((a, b) =>
                b.date.localeCompare(a.date)
              );
            });
          } else {
            applyTodayCycle();
            setTodaySync("none");
          }
        }
        if (currentUser.gender === "female") {
          const cycleRes = await getCycleProfile();
          if (!cancelled && cycleRes.success) {
            setCycleProfile(cycleRes.profile);
            if (cycleRes.profile?.lastPeriodStart) {
              setPeriodStartDate(cycleRes.profile.lastPeriodStart);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 按 accountId 重载，避免 SessionUser 对象引用抖动
  }, [isMounted, currentUser?.accountId, currentUser?.playerId, currentUser?.gender]);

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
      asOfDateStr: currentUser
        ? getTeamTodayDateStr(currentUser.teamTimeZone)
        : undefined,
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
        date: getTeamTodayDateStr(currentUser.teamTimeZone),
        sleep,
        stress,
        fatigue,
        soreness,
        willingness,
        physicalBattery: feedback.physicalBattery,
        mentalDrive: feedback.mentalDrive,
        quadrant: feedback.quadrant,
        schemaVersion: READINESS_DRAFT_SCHEMA_VERSION,
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
        syncStatus: "pending",
      };
      const res = await saveReadinessAssessment(
        toReadinessCloudSaveInput(entry)
      );
      if (res.success) {
        setNotice("云端打卡成功");
        setTodaySync("cloud");
      } else {
        console.error("云端被拒:", res.error);
        upsertReadinessEntry(draftScope, entry);
        setTodaySync("local");
        setNotice(PENDING_SYNC_COPY);
      }
      setFailedLocal(loadFailedReadinessHistory(draftScope));
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
    const date = getTeamTodayDateStr(currentUser.teamTimeZone);
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
    removeReadinessEntry(draftScope, playerId, date);
    setHistory((prev) =>
      prev.filter(
        (item) =>
          !(item.playerId === currentUser.playerId && item.date === date)
      )
    );
    setTodaySync("none");
    setResult(null);
  };

  const dismissFailedLocal = (playerId: string, date: string) => {
    removeReadinessEntry(draftScope, playerId, date);
    setFailedLocal(loadFailedReadinessHistory(draftScope));
  };

  const applyCycleProfile = (profile: NonNullable<typeof cycleProfile>) => {
    setCycleProfile(profile);
    if (profile.lastPeriodStart) {
      setPeriodStartDate(profile.lastPeriodStart);
    }
  };

  const handleRecordPeriodStart = async () => {
    if (!currentUser?.playerId || !cycleTracking || !periodStartDate) return;
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
      setPeriodStartDate("");
    }
  };

  const handlePeriodDateChange = (next: string) => {
    setPeriodStartDate(next);
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
    todaySync,
    result,
    notice,
    failedLocal,
    dismissFailedLocal,
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
