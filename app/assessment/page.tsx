"use client";

import Link from "next/link";
import { useRequireAuth } from "@/lib/useRequireAuth";
import MedicalDisclaimer from "@/components/MedicalDisclaimer";
import PageLoading from "@/components/PageLoading";
import { RecordActions } from "@/components/records/RecordActions";
import { BatteryDriveChart } from "@/components/status/BatteryDriveChart";
import { ScaleSlider } from "@/components/status/ScaleSlider";
import {
  CycleConsentPanel,
  CycleResultExtras,
  CycleTrackingPanel,
} from "@/components/status/CyclePanel";
import { PRE_DIMENSIONS, PRE_SCAN_PROMPT, type Scale5 } from "@/lib/clinical/preDimensions";
import { useAssessmentPage } from "@/hooks/useAssessmentPage";

export default function AssessmentPage() {
  const { currentUser, isMounted } = useRequireAuth();
  const page = useAssessmentPage(currentUser, isMounted);

  if (!isMounted) return <PageLoading />;
  if (!currentUser) return <PageLoading />;

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
        {page.notice ? (
          <p className="border border-zinc-300 bg-white p-3 text-sm text-zinc-700">
            {page.notice}
          </p>
        ) : null}
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
            value={page.dimValues[dim.field]!}
            onChange={(n) => page.dimSetters[dim.field]!(n as Scale5)}
          />
        ))}
        {page.isFemale && (
          <div className="flex flex-col gap-3 border border-zinc-200 p-4">
            <label className="text-xs uppercase text-gray-500">
              生理周期监测（自愿）
            </label>
            {!page.cycleTracking ? (
              <CycleConsentPanel
                periodStartDate={page.periodStartDate}
                onPeriodStartDate={(next) => {
                  page.setPeriodStartDate(next);
                  if (currentUser.playerId) {
                    page.persistPeriodStartDate(currentUser.playerId, next);
                  }
                }}
                consentBusy={page.consentBusy}
                onConsent={(share) => void page.handleConsent(share)}
              />
            ) : (
              <CycleTrackingPanel
                cycleProfile={page.cycleProfile}
                periodStartDate={page.periodStartDate}
                crampsScore={page.crampsScore}
                cycleEnergy={page.cycleEnergy}
                cycleMood={page.cycleMood}
                cycleIrregular={page.cycleIrregular}
                onPeriodDateChange={page.handlePeriodDateChange}
                onRecordPeriodStart={() => void page.handleRecordPeriodStart()}
                onUpdatePeriodEvent={(event, patch) =>
                  void page.handleUpdatePeriodEvent(event.id, patch)
                }
                onDeletePeriodEvent={(id) => void page.handleDeletePeriodEvent(id)}
                onCramps={page.setCrampsScore}
                onEnergy={page.setCycleEnergy}
                onMood={page.setCycleMood}
                onIrregular={page.setCycleIrregular}
                onPatch={(patch) => void page.patchCycleSettings(patch)}
                onDisable={() => void page.handleDisableTracking()}
              />
            )}
          </div>
        )}
        <button
          onClick={page.handleGenerate}
          disabled={page.isLoadingHistory}
          className="bg-black py-2 text-sm text-white transition-colors hover:bg-zinc-800 disabled:bg-zinc-300 disabled:text-zinc-500"
        >
          {page.hasTodayCheck ? "更新今日四象限反馈" : "生成今日四象限反馈"}
        </button>
        {page.hasTodayCheck ? (
          <div className="flex justify-end">
            <RecordActions
              onDelete={() => void page.handleDeleteToday()}
              deleteConfirm="确认删除今日评估记录？"
            />
          </div>
        ) : null}
        {page.result && (
          <div className="flex flex-col gap-3 border-2 border-zinc-900 bg-white p-4">
            <CycleResultExtras
              cyclePhaseLabel={page.result.cyclePhaseLabel}
              cycleConfidence={page.result.cycleConfidence}
              cycleGuidance={page.result.cycleGuidance}
              showAclCues={page.result.showAclCues}
              showFemaleRedFlags={page.result.showFemaleRedFlags}
              redsReasons={page.result.redsReasons}
            />
            <h2 className="text-lg font-medium text-zinc-900">
              {page.result.feedback.title}
            </h2>
            <p className="font-mono text-xs text-zinc-500">
              电量 {page.result.feedback.physicalBattery.toFixed(1)} · 动力{" "}
              {page.result.feedback.mentalDrive}
            </p>
            <BatteryDriveChart
              physicalBattery={page.result.feedback.physicalBattery}
              mentalDrive={page.result.feedback.mentalDrive}
            />
            <p className="whitespace-pre-line text-sm leading-relaxed text-zinc-700">
              {page.result.feedback.narrative}
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
