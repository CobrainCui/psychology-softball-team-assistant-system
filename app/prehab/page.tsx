"use client";

import { Suspense, useEffect, useState } from "react";
import {
  PAIN_AREA_LABEL,
  PAIN_AREA_OPTIONS,
  PAIN_CIRCUIT_BREAKER_THRESHOLD,
  type PainArea,
} from "@/lib/clinical/painAreas";
import {
  PROBE_ACTION_DICTIONARY,
  type ProtocolEntry,
} from "@/lib/clinical/prehabProtocols";
import {
  PREHAB_SYMPTOM_OPTIONS,
  prehabSymptomLabel,
  resolvePrehabProtocol,
  type PrehabSymptom,
} from "@/lib/clinical/resolvePrehabProtocol";
import {
  availabilityLabel,
  deriveAvailabilityStatus,
  type AvailabilityStatus,
} from "@/lib/clinical/availabilityStatus";
import { getVasBandLabel, VAS_SCALE_HINT } from "@/lib/clinical/vasBands";
import { appendInjuryLogEntry } from "@/lib/injuryLog";
import {
  getPlayerAvailability,
  saveInjuryLog,
  type AvailabilitySnapshot,
} from "@/lib/actions";
import { useRequireAuth } from "@/lib/useRequireAuth";
import MedicalDisclaimer from "@/components/MedicalDisclaimer";
import type { ProbeFeedback } from "@/lib/readinessHistory";

type InjuryTab = "monitor" | "advice" | "prevent";

const PROBE_OPTIONS: { value: ProbeFeedback; label: string }[] = [
  { value: "A", label: "A. 已完全恢复无痛感" },
  { value: "B", label: "B. 仍有卡顿或轻微拉扯感" },
  { value: "C", label: "C. 疼痛加剧，影响动作" },
];

interface AdviceResult {
  painArea: PainArea;
  painAreaLabel: string;
  painScore: number;
  isSevere: boolean;
  protocol: ProtocolEntry;
  symptom: PrehabSymptom;
  availability: AvailabilityStatus;
}

function InjuryPageContent() {
  const { currentUser, isMounted } = useRequireAuth();

  const [tab, setTab] = useState<InjuryTab>("advice");
  const [availability, setAvailability] = useState<AvailabilitySnapshot | null>(
    null
  );
  const [probeFeedback, setProbeFeedback] = useState<ProbeFeedback | null>(
    null
  );
  const [loadError, setLoadError] = useState<string | null>(null);

  const [painArea, setPainArea] = useState<PainArea>("shoulder");
  const [painScore, setPainScore] = useState(3);
  const [symptom, setSymptom] = useState<PrehabSymptom>("dull");
  const [result, setResult] = useState<AdviceResult | null>(null);
  const [archiveStatus, setArchiveStatus] = useState<
    "idle" | "saving" | "archived" | "local"
  >("idle");

  const reloadAvailability = async (playerId: string) => {
    const res = await getPlayerAvailability(playerId);
    if (!res.success) {
      console.error("云端被拒:", res.error);
      setLoadError(res.error);
      setAvailability(null);
      return;
    }
    setLoadError(null);
    setAvailability(res.availability);
    if (res.availability.needsProbe && res.availability.painArea) {
      setTab("monitor");
    }
  };

  useEffect(() => {
    if (!isMounted || !currentUser) return;
    void reloadAvailability(currentUser.playerId);
  }, [isMounted, currentUser?.playerId]);

  const handleGenerateAdvice = () => {
    const isSevere = painScore >= PAIN_CIRCUIT_BREAKER_THRESHOLD;
    const status = deriveAvailabilityStatus({
      painScore,
      probeFeedback: null,
    });
    setResult({
      painArea,
      painAreaLabel: PAIN_AREA_LABEL[painArea],
      painScore,
      isSevere,
      protocol: resolvePrehabProtocol(painArea, symptom),
      symptom,
      availability: status,
    });
    setArchiveStatus("idle");
  };

  const handleArchiveAdvice = async () => {
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
      setResult((prev) =>
        prev ? { ...prev, availability: res.availability } : prev
      );
      window.alert(
        `已归档。上场可用性：${availabilityLabel(res.availability)}`
      );
      await reloadAvailability(currentUser.playerId);
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

  const handleProbeSubmit = async () => {
    if (!currentUser || !availability?.painArea || !probeFeedback) return;
    const symptomText =
      probeFeedback === "A"
        ? "旧伤探针：已恢复"
        : probeFeedback === "B"
          ? "旧伤探针：仍有不适"
          : "旧伤探针：疼痛加剧";

    const res = await saveInjuryLog({
      playerId: currentUser.playerId,
      painArea: availability.painArea,
      painScore:
        probeFeedback === "C"
          ? Math.max(availability.painScore, PAIN_CIRCUIT_BREAKER_THRESHOLD)
          : probeFeedback === "A"
            ? 0
            : Math.max(3, availability.painScore),
      symptom: symptomText,
      probeFeedback,
      cleared: probeFeedback === "A",
    });

    if (!res.success) {
      console.error("云端被拒:", res.error);
      window.alert(`探针提交失败：${res.error}`);
      return;
    }
    window.alert(`探针已记录。上场可用性：${availabilityLabel(res.availability)}`);
    setProbeFeedback(null);
    await reloadAvailability(currentUser.playerId);
    if (res.availability === "full") setTab("advice");
  };

  if (!isMounted || !currentUser) return null;

  const probeArea = availability?.painArea;
  const probeAction =
    probeArea && probeArea !== "wrist"
      ? PROBE_ACTION_DICTIONARY[probeArea]
      : null;

  const tabs: { id: InjuryTab; label: string }[] = [
    { id: "monitor", label: "监控" },
    { id: "advice", label: "伤后建议" },
    { id: "prevent", label: "预防" },
  ];

  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 p-6">
      <main className="flex w-full max-w-2xl flex-col gap-4">
        <div className="text-center">
          <h1 className="text-sm font-medium tracking-wide text-zinc-500">
            运动损伤
          </h1>
          <p className="mt-1 text-xs text-zinc-400">
            当前球员：{currentUser.playerName}
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            监控 · 伤后建议 · 预防（建设中）
          </p>
        </div>

        <MedicalDisclaimer />

        <div className="flex gap-1 border border-zinc-200 p-1">
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`flex-1 py-2 text-xs transition-colors ${
                tab === item.id
                  ? "bg-zinc-900 text-white"
                  : "text-zinc-500 hover:bg-zinc-100"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {loadError && (
          <p className="border border-red-300 bg-red-50 p-3 text-sm text-red-700">
            {loadError}
          </p>
        )}

        {tab === "monitor" && (
          <div className="flex flex-col gap-3 border border-zinc-200 p-4">
            <p className="text-xs font-semibold uppercase text-zinc-500">
              监控 · 上场可用性
            </p>
            {availability ? (
              <>
                <p className="text-sm text-zinc-900">
                  当前：
                  <span className="ml-1 font-medium">
                    {availability.statusLabel}
                  </span>
                  {availability.painAreaLabel
                    ? ` · ${availability.painAreaLabel}`
                    : ""}
                  {availability.date ? ` · 记录日 ${availability.date}` : ""}
                </p>
                {availability.needsProbe && probeAction && (
                  <div className="flex flex-col gap-2 border border-amber-300 bg-amber-50 p-3">
                    <p className="text-xs font-semibold uppercase text-amber-700">
                      旧伤探针
                    </p>
                    <p className="text-sm text-zinc-900">{probeAction}</p>
                    <div className="flex flex-col gap-1">
                      {PROBE_OPTIONS.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => setProbeFeedback(option.value)}
                          className={`border px-3 py-2 text-left text-xs ${
                            probeFeedback === option.value
                              ? "border-zinc-900 bg-zinc-900 text-white"
                              : "border-amber-300 bg-white text-zinc-700"
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      disabled={!probeFeedback}
                      onClick={() => void handleProbeSubmit()}
                      className="bg-black py-2 text-xs text-white disabled:opacity-40"
                    >
                      提交探针结果
                    </button>
                  </div>
                )}
                {!availability.needsProbe && (
                  <p className="text-xs text-zinc-400">
                    暂无待复查伤况。新发不适请在「伤后建议」填报。
                  </p>
                )}
              </>
            ) : (
              <p className="text-sm text-zinc-400">加载可用性…</p>
            )}
          </div>
        )}

        {tab === "advice" && (
          <>
            <div className="flex flex-col gap-2 border border-zinc-200 p-4">
              <label className="text-xs uppercase text-gray-500">
                疼痛部位
              </label>
              <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
                {PAIN_AREA_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setPainArea(option.value)}
                    className={`border py-2 text-xs ${
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
                <span className="text-right font-mono text-sm">
                  {painScore} · {getVasBandLabel(painScore)}
                </span>
                <p className="text-xs text-zinc-400">{VAS_SCALE_HINT}</p>
              </div>
              <div className="flex flex-col gap-2 border border-zinc-200 p-4">
                <label className="text-xs uppercase text-gray-500">
                  症状特征
                </label>
                <select
                  value={symptom}
                  onChange={(e) =>
                    setSymptom(e.target.value as PrehabSymptom)
                  }
                  className="border border-zinc-300 bg-white px-3 py-2 text-sm"
                >
                  {PREHAB_SYMPTOM_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <button
              type="button"
              onClick={handleGenerateAdvice}
              className="bg-black py-2 text-sm text-white hover:bg-zinc-800"
            >
              生成伤后建议与可用性
            </button>

            {result && (
              <div className="flex flex-col gap-3 border-2 border-zinc-900 p-4">
                <div className="text-xs uppercase text-zinc-400">
                  {result.painAreaLabel} · VAS {result.painScore} ·{" "}
                  {prehabSymptomLabel(result.symptom)} · 可用性{" "}
                  {availabilityLabel(result.availability)}
                </div>

                {result.isSevere || result.availability === "unavailable" ? (
                  <div className="border border-red-600 bg-red-600 p-3 text-white">
                    <p className="text-sm font-semibold">
                      伤缺 / 熔断：停止专项训练，寻求专业运动医学评估。
                    </p>
                  </div>
                ) : null}

                {result.protocol.type === "specific" ? (
                  <>
                    <div className="border border-red-500 p-3">
                      <p className="text-xs font-semibold uppercase text-red-600">
                        绝对红线
                      </p>
                      <p className="mt-1 text-sm">{result.protocol.redLine}</p>
                    </div>
                    <div className="border border-zinc-300 p-3">
                      <p className="text-xs font-semibold uppercase text-zinc-500">
                        松解排雷
                      </p>
                      <p className="mt-1 text-sm">{result.protocol.release}</p>
                    </div>
                    <div className="border border-zinc-300 p-3">
                      <p className="text-xs font-semibold uppercase text-zinc-500">
                        代偿激活
                      </p>
                      <p className="mt-1 text-sm">
                        {result.protocol.activation}
                      </p>
                    </div>
                  </>
                ) : (
                  <div className="border border-zinc-300 p-3">
                    <p className="text-xs font-semibold uppercase text-zinc-500">
                      通用建议
                    </p>
                    <p className="mt-1 text-sm">{result.protocol.advice}</p>
                  </div>
                )}

                {!result.isSevere && (
                  <button
                    type="button"
                    onClick={() => void handleArchiveAdvice()}
                    disabled={archiveStatus === "saving"}
                    className="border border-zinc-900 py-2 text-xs disabled:opacity-40"
                  >
                    {archiveStatus === "saving"
                      ? "归档中…"
                      : archiveStatus === "archived"
                        ? "已云端归档"
                        : archiveStatus === "local"
                          ? "已存本地草稿"
                          : "归档至伤病史并更新可用性"}
                  </button>
                )}
              </div>
            )}
          </>
        )}

        {tab === "prevent" && (
          <div className="flex flex-col gap-2 border border-dashed border-zinc-300 p-4">
            <p className="text-xs font-semibold uppercase text-zinc-500">
              预防
            </p>
            <p className="text-sm leading-relaxed text-zinc-600">
              赛季常备神经肌肉控制与动力链预康复课表将放在此处（如落地膝位、臀中肌、腘绳肌离心、肩胛
              YTWL）。
            </p>
            <p className="text-xs text-zinc-400">内容建设中 · 本轮仅占位</p>
          </div>
        )}
      </main>
    </div>
  );
}

export default function InjuryPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-1 items-center justify-center bg-zinc-50 p-6 text-sm text-zinc-400">
          加载中…
        </div>
      }
    >
      <InjuryPageContent />
    </Suspense>
  );
}
