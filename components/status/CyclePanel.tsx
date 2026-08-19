"use client";

import {
  ACL_PREVENTION_CUES,
  CYCLE_CONSENT_POINTS,
  FEMALE_HEALTH_RED_FLAGS,
  type CycleGuidance,
} from "@/lib/clinical/cycleGuidance";
import type {
  CycleEnergyLevel,
  CycleMoodLevel,
  CycleProfileDto,
  CycleSharingLevel,
} from "@/lib/cycleTypes";

export function CycleConsentPanel({
  periodStartDate,
  onPeriodStartDate,
  consentBusy,
  onConsent,
}: {
  periodStartDate: string;
  onPeriodStartDate: (next: string) => void;
  consentBusy: boolean;
  onConsent: (shareWithCoach: boolean) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs leading-relaxed text-zinc-500">
        开启后用于个人负荷参考。不开启不影响状态打卡。
      </p>
      <ul className="list-inside list-disc text-xs leading-relaxed text-zinc-500">
        {CYCLE_CONSENT_POINTS.map((point) => (
          <li key={point}>{point}</li>
        ))}
      </ul>
      <div className="flex flex-col gap-1">
        <span className="text-xs text-zinc-400">
          可选：上次经期开始日（可稍后填写）
        </span>
        <input
          type="date"
          value={periodStartDate}
          onChange={(e) => onPeriodStartDate(e.target.value)}
          className="border border-zinc-300 px-3 py-2 text-sm text-zinc-900"
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={consentBusy}
          onClick={() => onConsent(false)}
          className="border border-zinc-900 bg-zinc-900 px-3 py-1.5 text-xs text-white disabled:bg-zinc-200 disabled:text-zinc-500"
        >
          同意并仅本人可见
        </button>
        <button
          type="button"
          disabled={consentBusy}
          onClick={() => onConsent(true)}
          className="border border-zinc-300 px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-100 disabled:bg-zinc-200"
        >
          同意并分享脱敏负荷给教练
        </button>
      </div>
    </div>
  );
}

export function CycleTrackingPanel({
  cycleProfile,
  periodStartDate,
  crampsScore,
  cycleEnergy,
  cycleMood,
  cycleIrregular,
  onPeriodDateChange,
  onCramps,
  onEnergy,
  onMood,
  onIrregular,
  onPatch,
  onDisable,
}: {
  cycleProfile: CycleProfileDto | null;
  periodStartDate: string;
  crampsScore: number;
  cycleEnergy: CycleEnergyLevel | null;
  cycleMood: CycleMoodLevel | null;
  cycleIrregular: boolean;
  onPeriodDateChange: (next: string) => void;
  onCramps: (n: number) => void;
  onEnergy: (v: CycleEnergyLevel | null) => void;
  onMood: (v: CycleMoodLevel | null) => void;
  onIrregular: (v: boolean) => void;
  onPatch: (
    patch: Partial<{
      hormonalContraception: boolean;
      sharingLevel: CycleSharingLevel;
      bodyImageAnxietyOptIn: boolean;
    }>
  ) => void;
  onDisable: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <span className="text-xs text-zinc-400">上次经期开始日</span>
        <input
          type="date"
          value={periodStartDate}
          onChange={(e) => onPeriodDateChange(e.target.value)}
          className="border border-zinc-300 px-3 py-2 text-sm text-zinc-900"
        />
      </div>
      <p className="text-xs leading-relaxed text-zinc-400">
        典型周期约 {cycleProfile?.resolvedLengthDays ?? 28} 天 · 置信度{" "}
        {cycleProfile?.confidence ?? "low"}
        {cycleProfile?.highVariance ? " · 波动偏大，阶段标签已降级" : ""}
        {cycleProfile?.hormonalContraception
          ? " · 已标记激素避孕，以症状驱动为主"
          : ""}
      </p>
      <div className="flex flex-col gap-2">
        <span className="text-xs text-zinc-500">今日痛经 (0 无 / 10 极重)</span>
        <input
          type="range"
          min={0}
          max={10}
          step={1}
          value={crampsScore}
          onChange={(e) => onCramps(Number(e.target.value))}
          className="accent-zinc-900"
        />
        <span className="text-right font-mono text-sm text-zinc-900">
          {crampsScore}
        </span>
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-xs text-zinc-500">今日能量</span>
        <div className="flex gap-1">
          {([
            ["low", "低"],
            ["mid", "中"],
            ["high", "高"],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => onEnergy(cycleEnergy === value ? null : value)}
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
        <span className="text-xs text-zinc-500">今日情绪（仅本人）</span>
        <div className="flex gap-1">
          {([
            ["steady", "平稳"],
            ["irritable", "易烦"],
            ["low", "低落"],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => onMood(cycleMood === value ? null : value)}
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
        <span className="text-xs text-zinc-500">近 3 个月月经是否大致规律？</span>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => onIrregular(false)}
            className={`border px-3 py-1 text-xs ${
              !cycleIrregular
                ? "border-zinc-900 bg-zinc-900 text-white"
                : "border-zinc-300 text-zinc-500"
            }`}
          >
            规律
          </button>
          <button
            type="button"
            onClick={() => onIrregular(true)}
            className={`border px-3 py-1 text-xs ${
              cycleIrregular
                ? "border-amber-600 bg-amber-600 text-white"
                : "border-zinc-300 text-zinc-500"
            }`}
          >
            不规律/长期未来潮
          </button>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 border-t border-zinc-200 pt-3">
        <button
          type="button"
          onClick={() =>
            onPatch({
              hormonalContraception: !cycleProfile?.hormonalContraception,
            })
          }
          className={`border px-3 py-1 text-xs ${
            cycleProfile?.hormonalContraception
              ? "border-zinc-900 bg-zinc-900 text-white"
              : "border-zinc-300 text-zinc-600"
          }`}
        >
          激素避孕/无规律出血
        </button>
        <button
          type="button"
          onClick={() =>
            onPatch({
              sharingLevel:
                cycleProfile?.sharingLevel === "none" ? "load_only" : "none",
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
            onPatch({
              bodyImageAnxietyOptIn: !cycleProfile?.bodyImageAnxietyOptIn,
            })
          }
          className={`border px-3 py-1 text-xs ${
            cycleProfile?.bodyImageAnxietyOptIn
              ? "border-amber-600 bg-amber-600 text-white"
              : "border-zinc-300 text-zinc-600"
          }`}
        >
          饮食/体重持续焦虑（敏感·可选）
        </button>
        <button
          type="button"
          onClick={onDisable}
          className="border border-zinc-300 px-3 py-1 text-xs text-zinc-500"
        >
          关闭追踪
        </button>
      </div>
      {cycleIrregular && (
        <p className="text-xs leading-relaxed text-amber-700">
          提示：月经长期不规律可能与低能量可用性（RED-S）相关，建议优先提高能量摄入并转介专业医疗，而非仅靠减训硬撑。
        </p>
      )}
    </div>
  );
}

export function CycleResultExtras({
  cyclePhaseLabel,
  cycleConfidence,
  cycleGuidance,
  showAclCues,
  showFemaleRedFlags,
  redsReasons,
}: {
  cyclePhaseLabel: string | null;
  cycleConfidence: string | null;
  cycleGuidance: CycleGuidance | null;
  showAclCues: boolean;
  showFemaleRedFlags: boolean;
  redsReasons: string[];
}) {
  return (
    <>
      {cyclePhaseLabel && (
        <span className="text-xs uppercase text-zinc-500">
          推算生理阶段：{cyclePhaseLabel}
          {cycleConfidence ? ` · 置信度 ${cycleConfidence}` : ""}
        </span>
      )}
      {cycleGuidance && (
        <div className="mt-4 border border-zinc-200 p-3">
          <p className="text-xs font-semibold uppercase text-zinc-500">
            周期同步训练 · {cycleGuidance.phaseLabel}
          </p>
          <p className="mt-1 text-sm leading-relaxed">{cycleGuidance.energyHint}</p>
          <ul className="mt-2 list-inside list-disc text-sm leading-relaxed text-zinc-700">
            {cycleGuidance.trainingFocus.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      )}
      {showAclCues && (
        <div className="mt-3 border border-amber-500 bg-amber-50 p-3 text-zinc-900">
          <p className="text-xs font-semibold uppercase text-amber-700">
            排卵窗口 · ACL 预防清单
          </p>
          <ul className="mt-2 list-inside list-disc text-sm leading-relaxed">
            {ACL_PREVENTION_CUES.map((cue) => (
              <li key={cue}>{cue}</li>
            ))}
          </ul>
        </div>
      )}
      {showFemaleRedFlags && (
        <div className="mt-3 border border-amber-600 p-3">
          <p className="text-xs font-semibold uppercase text-amber-800">
            女性健康早期警示（须转介，非诊断）
          </p>
          {redsReasons.length > 0 && (
            <ul className="mt-2 list-inside list-disc text-sm leading-relaxed">
              {redsReasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          )}
          <ul className="mt-2 list-inside list-disc text-sm leading-relaxed text-zinc-700">
            {FEMALE_HEALTH_RED_FLAGS.map((flag) => (
              <li key={flag}>{flag}</li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
