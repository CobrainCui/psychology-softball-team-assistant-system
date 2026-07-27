"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  PAIN_AREA_OPTIONS,
  PAIN_CIRCUIT_BREAKER_THRESHOLD,
  isPainArea,
  type PainArea,
} from "@/lib/clinical/painAreas";
import type { ProtocolEntry } from "@/lib/clinical/prehabProtocols";
import {
  PREHAB_SYMPTOM_OPTIONS,
  isPrehabSymptom,
  prehabSymptomLabel,
  resolvePrehabProtocol,
  type PrehabSymptom,
} from "@/lib/clinical/resolvePrehabProtocol";
import { getVasBandLabel, VAS_SCALE_HINT } from "@/lib/clinical/vasBands";
import { appendInjuryLogEntry } from "@/lib/injuryLog";
import { saveInjuryLog } from "@/lib/actions";
import { useRequireAuth } from "@/lib/useRequireAuth";
import MedicalDisclaimer from "@/components/MedicalDisclaimer";

interface PrehabResult {
  painArea: PainArea;
  painAreaLabel: string;
  painScore: number;
  isSevere: boolean;
  protocol: ProtocolEntry;
  symptom: PrehabSymptom;
}

function PrehabPageContent() {
  const { currentUser, isMounted } = useRequireAuth();
  const searchParams = useSearchParams();
  const router = useRouter();

  const [painArea, setPainArea] = useState<PainArea>("shoulder");
  const [painScore, setPainScore] = useState(3);
  const [symptom, setSymptom] = useState<PrehabSymptom>("dull");
  const [result, setResult] = useState<PrehabResult | null>(null);
  const [archiveStatus, setArchiveStatus] = useState<
    "idle" | "saving" | "archived" | "local"
  >("idle");
  const [prefillsApplied, setPrefillsApplied] = useState(false);

  // 评估页深链预填：?area=&vas=&from=assessment
  useEffect(() => {
    if (prefillsApplied) return;
    const areaParam = searchParams.get("area");
    const vasParam = searchParams.get("vas");
    if (isPainArea(areaParam)) {
      setPainArea(areaParam);
    }
    if (vasParam !== null) {
      const vas = Number(vasParam);
      if (Number.isFinite(vas)) {
        setPainScore(Math.max(0, Math.min(10, Math.round(vas))));
      }
    }
    const symptomParam = searchParams.get("symptom");
    if (isPrehabSymptom(symptomParam)) {
      setSymptom(symptomParam);
    }
    setPrefillsApplied(true);
  }, [searchParams, prefillsApplied]);

  const handleGenerate = () => {
    const isSevere = painScore >= PAIN_CIRCUIT_BREAKER_THRESHOLD;
    const painAreaLabel =
      PAIN_AREA_OPTIONS.find((option) => option.value === painArea)?.label ??
      "";

    setResult({
      painArea,
      painAreaLabel,
      painScore,
      isSevere,
      protocol: resolvePrehabProtocol(painArea, symptom),
      symptom,
    });
    setArchiveStatus("idle");
  };

  const handleArchive = async () => {
    if (!result || !currentUser || archiveStatus === "saving") return;

    const symptomText = prehabSymptomLabel(result.symptom);
    setArchiveStatus("saving");

    const res = await saveInjuryLog({
      playerId: currentUser.playerId,
      painArea: result.painArea,
      painScore: result.painScore,
      symptom: symptomText,
    });

    if (res.success) {
      setArchiveStatus("archived");
      window.alert("云端归档成功！");
      if (searchParams.get("from") === "assessment") {
        router.replace("/prehab");
      }
    } else {
      console.error("云端被拒:", res.error);
      appendInjuryLogEntry({
        playerId: currentUser.playerId,
        playerName: currentUser.playerName,
        painArea: result.painArea,
        painAreaLabel: result.painAreaLabel,
        painScore: result.painScore,
        symptom: symptomText,
      });
      setArchiveStatus("local");
      window.alert("云端同步失败，已保存为本地草稿。");
    }

    setTimeout(() => setArchiveStatus("idle"), 2000);
  };

  if (!isMounted || !currentUser) return null;

  const fromAssessment = searchParams.get("from") === "assessment";

  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 p-6">
      <main className="flex w-full max-w-2xl flex-col gap-4">
        <div className="text-center">
          <h1 className="text-sm font-medium tracking-wide text-zinc-500">
            运动损伤与预防
          </h1>
          <p className="mt-1 text-xs text-zinc-400">
            当前球员：{currentUser.playerName}
          </p>
          {fromAssessment && (
            <p className="mt-1 text-xs text-amber-700">
              已从综合状态评估预填部位与 VAS，请确认症状后生成处方。
            </p>
          )}
        </div>

        <MedicalDisclaimer />

        <div className="flex flex-col gap-2 border border-zinc-200 p-4">
          <label className="text-xs uppercase text-gray-500">
            疼痛部位选择
          </label>
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
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2 border border-zinc-200 p-4">
            <label className="text-xs uppercase text-gray-500">
              疼痛等级 (VAS)
            </label>
            <input
              type="range"
              min={0}
              max={10}
              step={1}
              value={painScore}
              onChange={(e) => setPainScore(Number(e.target.value))}
              className="accent-red-600"
            />
            <div className="flex items-center justify-between text-xs text-zinc-400">
              <span>0 无感</span>
              <span>{PAIN_CIRCUIT_BREAKER_THRESHOLD} 熔断</span>
              <span>10 无法忍受</span>
            </div>
            <span className="text-right font-mono text-sm text-zinc-900">
              {painScore} · {getVasBandLabel(painScore)}
            </span>
            <p className="text-xs text-zinc-400">{VAS_SCALE_HINT}</p>
          </div>

          <div className="flex flex-col gap-2 border border-zinc-200 p-4">
            <label className="text-xs uppercase text-gray-500">症状特征</label>
            <select
              value={symptom}
              onChange={(e) => setSymptom(e.target.value as PrehabSymptom)}
              className="border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
            >
              {PREHAB_SYMPTOM_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <p className="text-xs leading-relaxed text-zinc-400">
              刺痛/弹响将提高转诊权重并禁止高强度激活；无力感优先动力链减负。
            </p>
          </div>
        </div>

        <button
          onClick={handleGenerate}
          className="bg-black py-2 text-sm text-white transition-colors hover:bg-zinc-800"
        >
          生成运动损伤与预防处方
        </button>

        {result && result.isSevere && (
          <div className="border-2 border-red-700 bg-red-600 p-4 text-white">
            <p className="text-center text-base font-semibold leading-relaxed">
              疼痛等级突破阈值（≥{PAIN_CIRCUIT_BREAKER_THRESHOLD}），立刻停止一切训练，介入专业运动医学诊断。
            </p>
            <p className="mt-2 text-center text-sm opacity-90">
              {getVasBandLabel(result.painScore)}
            </p>
          </div>
        )}

        {result && !result.isSevere && (
          <div className="flex flex-col gap-3 border-2 border-zinc-900 p-4">
            <div className="text-xs uppercase text-zinc-400">
              部位：{result.painAreaLabel} · VAS {result.painScore} / 10 ·{" "}
              {getVasBandLabel(result.painScore)} ·{" "}
              {prehabSymptomLabel(result.symptom)}
            </div>

            {result.protocol.type === "specific" ? (
              <>
                <div className="border border-red-500 p-3">
                  <p className="text-xs font-semibold uppercase text-red-600">
                    绝对红线
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-zinc-900">
                    {result.protocol.redLine}
                  </p>
                </div>
                <div className="border border-zinc-300 p-3">
                  <p className="text-xs font-semibold uppercase text-zinc-500">
                    松解排雷
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-zinc-900">
                    {result.protocol.release}
                  </p>
                </div>
                <div className="border border-zinc-300 p-3">
                  <p className="text-xs font-semibold uppercase text-zinc-500">
                    代偿激活
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-zinc-900">
                    {result.protocol.activation}
                  </p>
                </div>
              </>
            ) : (
              <div className="border border-zinc-300 p-3">
                <p className="text-xs font-semibold uppercase text-zinc-500">
                  通用建议
                </p>
                <p className="mt-1 text-sm leading-relaxed text-zinc-900">
                  {result.protocol.advice}
                </p>
              </div>
            )}

            <button
              onClick={() => void handleArchive()}
              disabled={archiveStatus === "saving"}
              className="mt-1 w-full border border-zinc-900 py-2 text-xs text-zinc-900 transition-colors hover:bg-zinc-900 hover:text-white disabled:opacity-40"
            >
              {archiveStatus === "saving"
                ? "归档中…"
                : archiveStatus === "archived"
                  ? "已云端归档"
                  : archiveStatus === "local"
                    ? "已存本地草稿"
                    : "将处方归档至个人伤病史"}
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

export default function PrehabPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-1 items-center justify-center bg-zinc-50 p-6 text-sm text-zinc-400">
          加载中…
        </div>
      }
    >
      <PrehabPageContent />
    </Suspense>
  );
}
