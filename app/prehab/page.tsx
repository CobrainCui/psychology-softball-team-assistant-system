"use client";

import { useState } from "react";
import {
  PAIN_AREA_OPTIONS,
  PAIN_CIRCUIT_BREAKER_THRESHOLD,
  type PainArea,
} from "@/lib/clinical/painAreas";
import { appendInjuryLogEntry } from "@/lib/injuryLog";
import { useRequireAuth } from "@/lib/useRequireAuth";

type Symptom = "sharp" | "dull" | "click" | "weak";

const SYMPTOM_OPTIONS: { value: Symptom; label: string }[] = [
  { value: "sharp", label: "刺痛/拉扯感" },
  { value: "dull", label: "隐隐钝痛" },
  { value: "click", label: "关节弹响/卡顿" },
  { value: "weak", label: "无力感" },
];

type ProtocolEntry =
  | { type: "specific"; redLine: string; release: string; activation: string }
  | { type: "generic"; advice: string };

const PREHAB_DICTIONARY: Record<PainArea, ProtocolEntry> = {
  shoulder: {
    type: "specific",
    redLine: "禁止过顶极速传球与大重量推举训练。",
    release: "网球定点压迫胸小肌与背阔肌外沿，禁止强行拉伸痛点。",
    activation: "弹力带古巴推举，配合 YTWL 字母操逐级激活肩胛稳定肌群。",
  },
  lumbar: {
    type: "specific",
    redLine: "禁止硬拉、脊柱爆发性扭转动作及全力挥击。",
    release: "仰卧抱膝放松，网球松解臀大肌上沿。",
    activation: "麦肯锡伸展法，配合死虫式核心抗伸展训练。",
  },
  knee: {
    type: "specific",
    redLine: "禁止大角度深蹲、急停变向动作及捕手蹲姿。",
    release: "泡沫轴滚压大腿前侧及阔筋膜张肌，绝对避开膝盖外侧痛点。",
    activation: "侧卧蚌壳式训练，配合侧向弹力带行走激活臀中肌。",
  },
  ankle: {
    type: "generic",
    advice:
      "遵循 RICE 原则 (休息 Rest / 冰敷 Ice / 加压 Compression / 抬高 Elevation)，并尽快寻求专业运动医学诊断介入，此部位暂不提供自助松解处方。",
  },
  wrist: {
    type: "generic",
    advice:
      "遵循 RICE 原则 (休息 Rest / 冰敷 Ice / 加压 Compression / 抬高 Elevation)，并尽快寻求专业运动医学诊断介入，此部位暂不提供自助松解处方。",
  },
};

interface PrehabResult {
  painArea: PainArea;
  painAreaLabel: string;
  painScore: number;
  isSevere: boolean;
  protocol: ProtocolEntry;
}

export default function PrehabPage() {
  const { currentUser, isMounted } = useRequireAuth();

  const [painArea, setPainArea] = useState<PainArea>("shoulder");
  const [painScore, setPainScore] = useState(3);
  const [symptom, setSymptom] = useState<Symptom>("dull");
  const [result, setResult] = useState<PrehabResult | null>(null);
  const [archiveStatus, setArchiveStatus] = useState<"idle" | "archived">(
    "idle"
  );

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
      protocol: PREHAB_DICTIONARY[painArea],
    });
    setArchiveStatus("idle");
  };

  const handleArchive = () => {
    if (!result || !currentUser) return;

    const symptomLabel =
      SYMPTOM_OPTIONS.find((option) => option.value === symptom)?.label ?? "";

    appendInjuryLogEntry({
      playerId: currentUser.playerId,
      playerName: currentUser.playerName,
      painArea: result.painArea,
      painAreaLabel: result.painAreaLabel,
      painScore: result.painScore,
      symptom: symptomLabel,
    });

    setArchiveStatus("archived");
    setTimeout(() => setArchiveStatus("idle"), 2000);
  };

  if (!isMounted || !currentUser) return null;

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
        </div>

        <div className="flex flex-col gap-2 border border-zinc-200 p-4">
          <label className="text-xs uppercase text-gray-500">
            疼痛部位选择
          </label>
          <div className="grid grid-cols-2 gap-1 sm:grid-cols-5">
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
              <span>5 影响发力</span>
              <span>10 无法忍受</span>
            </div>
            <span className="text-right font-mono text-sm text-zinc-900">
              {painScore}
            </span>
          </div>

          <div className="flex flex-col gap-2 border border-zinc-200 p-4">
            <label className="text-xs uppercase text-gray-500">症状特征</label>
            <select
              value={symptom}
              onChange={(e) => setSymptom(e.target.value as Symptom)}
              className="border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
            >
              {SYMPTOM_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <button
          onClick={handleGenerate}
          className="bg-black py-2 text-sm text-white transition-colors hover:bg-zinc-800"
        >
          ⚠️ 生成运动损伤与预防处方
        </button>

        {result && result.isSevere && (
          <div className="border-2 border-red-700 bg-red-600 p-4 text-white">
            <p className="text-center text-base font-semibold leading-relaxed">
              🚨 疼痛等级突破阈值，立刻停止一切训练，介入专业运动医学诊断。
            </p>
          </div>
        )}

        {result && !result.isSevere && (
          <div className="flex flex-col gap-3 border-2 border-zinc-900 p-4">
            <div className="text-xs uppercase text-zinc-400">
              部位：{result.painAreaLabel} · VAS {result.painScore} / 10
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
              onClick={handleArchive}
              className="mt-1 w-full border border-zinc-900 py-2 text-xs text-zinc-900 transition-colors hover:bg-zinc-900 hover:text-white"
            >
              {archiveStatus === "archived"
                ? "✅ 已归档"
                : "💾 将处方归档至个人伤病史"}
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
