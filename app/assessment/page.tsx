"use client";

import { useEffect, useState } from "react";
import { useRequireAuth } from "@/lib/useRequireAuth";
import MedicalDisclaimer from "@/components/MedicalDisclaimer";
import {
  ASSESSMENT_PAIN_AREA_OPTIONS,
  PAIN_AREA_LABEL,
  PAIN_CIRCUIT_BREAKER_THRESHOLD,
  type PainArea,
} from "@/lib/clinical/painAreas";
import {
  getCyclePhase,
  getFemaleCyclePenalty,
} from "@/lib/clinical/cyclePhase";
import {
  ACL_PREVENTION_CUES,
  FEMALE_HEALTH_RED_FLAGS,
  getCycleGuidance,
  type CycleGuidance,
} from "@/lib/clinical/cycleGuidance";
import {
  COMPENSATION_ACTIVATION_DICTIONARY,
  INJURY_WARMUP_DICTIONARY,
  PROBE_ACTION_DICTIONARY,
} from "@/lib/clinical/prehabProtocols";
import { getVasBandLabel, VAS_SCALE_HINT } from "@/lib/clinical/vasBands";
import {
  findRecentInjuryPart,
  getTodayDateStr,
  loadPlayerReadinessHistory,
  type ProbeFeedback,
  type ReadinessHistoryEntry,
  upsertReadinessEntry,
} from "@/lib/readinessHistory";
import {
  getPeriodStartDate,
  setPeriodStartDate as persistPeriodStartDate,
} from "@/lib/periodStart";

type SleepQuality = "good" | "normal" | "bad";

const SLEEP_OPTIONS: { value: SleepQuality; label: string }[] = [
  { value: "good", label: "极佳 (8h 以上)" },
  { value: "normal", label: "普通 (6-8h)" },
  { value: "bad", label: "糟糕 (<6h / 失眠)" },
];

type AssessmentPainArea = Exclude<PainArea, "wrist">;

const PROBE_OPTIONS: { value: ProbeFeedback; label: string }[] = [
  { value: "A", label: "A. 已完全恢复无痛感" },
  { value: "B", label: "B. 仍有卡顿或轻微拉扯感" },
  { value: "C", label: "C. 疼痛加剧，影响动作" },
];

type ReadinessTier = "red" | "yellow" | "green";

const TIER_META: Record<
  ReadinessTier,
  { emoji: string; label: string; classes: string }
> = {
  red: {
    emoji: "🔴",
    label: "熔断状态",
    classes: "border-red-600 bg-black text-white",
  },
  yellow: {
    emoji: "🟡",
    label: "恢复/调整状态",
    classes: "border-amber-500 bg-white text-zinc-900",
  },
  green: {
    emoji: "🟢",
    label: "冲刺/最佳状态",
    classes: "border-zinc-900 bg-white text-zinc-900",
  },
};

interface ReadinessResult {
  score: number;
  tier: ReadinessTier;
  cyclePhaseLabel: string | null;
  cycleGuidance: CycleGuidance | null;
  showAclCues: boolean;
  showFemaleRedFlags: boolean;
  vasBandLabel: string | null;
  redReason: "newInjury" | "probe" | null;
  newInjuryAreaLabel: string | null;
  compensationAreaLabel: string | null;
  compensationAction: string | null;
}

export default function AssessmentPage() {
  const { currentUser, isMounted } = useRequireAuth();

  const [sleepQuality, setSleepQuality] = useState<SleepQuality>("normal");
  const [stressScore, setStressScore] = useState(3);
  const [fatigueScore, setFatigueScore] = useState(3);
  const [sorenessScore, setSorenessScore] = useState(3);
  const [periodStartDate, setPeriodStartDate] = useState("");
  const [cycleIrregular, setCycleIrregular] = useState(false);

  const [hasNewInjury, setHasNewInjury] = useState(false);
  const [newInjuryArea, setNewInjuryArea] =
    useState<AssessmentPainArea>("shoulder");
  const [newInjuryScore, setNewInjuryScore] = useState(3);

  const [history, setHistory] = useState<ReadinessHistoryEntry[]>([]);
  const [probeFeedback, setProbeFeedback] = useState<ProbeFeedback | null>(null);

  const [result, setResult] = useState<ReadinessResult | null>(null);

  useEffect(() => {
    if (!isMounted || !currentUser) return;
    setHistory(loadPlayerReadinessHistory(currentUser.playerId));
    if (currentUser.gender === "female") {
      setPeriodStartDate(getPeriodStartDate(currentUser.playerId));
    }
  }, [isMounted, currentUser?.playerId, currentUser?.gender]);

  const isFemale = isMounted && currentUser?.gender === "female";
  const recentInjuryRaw = findRecentInjuryPart(history);
  const recentInjuryPart: AssessmentPainArea | null =
    recentInjuryRaw && recentInjuryRaw !== "wrist" ? recentInjuryRaw : null;
  const isNewInjuryCritical =
    hasNewInjury && newInjuryScore >= PAIN_CIRCUIT_BREAKER_THRESHOLD;

  useEffect(() => {
    setProbeFeedback(null);
  }, [recentInjuryPart]);

  // 超级状态融合：Hooper 式维度（睡眠/压力/疲劳/酸痛）+ 周期负荷 + 历史探针
  const handleGenerate = () => {
    const isProbeCritical = recentInjuryPart !== null && probeFeedback === "C";

    const phase =
      isFemale && periodStartDate ? getCyclePhase(periodStartDate) : null;
    const cycleGuidance = phase ? getCycleGuidance(phase) : null;

    if (isNewInjuryCritical || isProbeCritical) {
      archiveToday(0);
      setResult({
        score: 0,
        tier: "red",
        cyclePhaseLabel: phase?.label ?? null,
        cycleGuidance,
        showAclCues: Boolean(phase?.isOvulation),
        showFemaleRedFlags: isFemale && cycleIrregular,
        vasBandLabel: isNewInjuryCritical
          ? getVasBandLabel(newInjuryScore)
          : null,
        redReason: isNewInjuryCritical ? "newInjury" : "probe",
        newInjuryAreaLabel: isNewInjuryCritical
          ? PAIN_AREA_LABEL[newInjuryArea]
          : null,
        compensationAreaLabel: null,
        compensationAction: null,
      });
      return;
    }

    let score = 100;

    if (sleepQuality === "bad") score -= 20;
    if (stressScore > 7) score -= 15;
    if (fatigueScore > 7) score -= 20;
    // 肌肉酸痛：对齐 Hooper Index 中的酸痛维度
    if (sorenessScore > 7) score -= 15;
    else if (sorenessScore >= 5) score -= 8;

    if (phase) {
      score -= getFemaleCyclePenalty(phase, Math.max(fatigueScore, sorenessScore));
    }

    const isProbeCaution = recentInjuryPart !== null && probeFeedback === "B";
    if (isProbeCaution) score -= 15;

    score = Math.max(0, Math.min(100, score));

    const needsCaution =
      hasNewInjury || isProbeCaution || (isFemale && cycleIrregular);
    let tier: ReadinessTier = score >= 70 ? "green" : "yellow";
    if (needsCaution && tier === "green") tier = "yellow";
    // 排卵期即便高分也不给全力变向绿灯（ACL 安全帽）
    if (phase?.isOvulation && tier === "green") tier = "yellow";

    archiveToday(score);

    setResult({
      score,
      tier,
      cyclePhaseLabel: phase?.label ?? null,
      cycleGuidance,
      showAclCues: Boolean(phase?.isOvulation),
      showFemaleRedFlags: isFemale && cycleIrregular,
      vasBandLabel: hasNewInjury ? getVasBandLabel(newInjuryScore) : null,
      redReason: null,
      newInjuryAreaLabel: hasNewInjury ? PAIN_AREA_LABEL[newInjuryArea] : null,
      compensationAreaLabel: isProbeCaution
        ? PAIN_AREA_LABEL[recentInjuryPart!]
        : null,
      compensationAction: isProbeCaution
        ? COMPENSATION_ACTIVATION_DICTIONARY[recentInjuryPart!]
        : null,
    });
  };

  const archiveToday = (score: number) => {
    if (!currentUser) return;

    let nextInjuryPart: PainArea | null = recentInjuryPart;
    if (hasNewInjury) {
      nextInjuryPart = newInjuryArea;
    } else if (probeFeedback === "A") {
      nextInjuryPart = null;
    }

    const entry: ReadinessHistoryEntry = {
      playerId: currentUser.playerId,
      date: getTodayDateStr(),
      readinessScore: score,
      hasNewInjury,
      injuryPart: nextInjuryPart,
      injuryScore: hasNewInjury ? newInjuryScore : 0,
      probeFeedback: recentInjuryPart !== null ? probeFeedback : null,
    };

    upsertReadinessEntry(entry);
    setHistory(loadPlayerReadinessHistory(currentUser.playerId));
  };

  if (!isMounted || !currentUser) return null;

  const canGenerate =
    (!isFemale || Boolean(periodStartDate)) &&
    (recentInjuryPart === null || probeFeedback !== null);

  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 p-6">
      <main className="flex w-full max-w-2xl flex-col gap-4">
        <div className="text-center">
          <h1 className="text-sm font-medium tracking-wide text-zinc-500">
            综合状态评估 (State Fusion Engine)
          </h1>
          <p className="mt-1 text-xs text-zinc-400">
            当前球员：{currentUser.playerName}
          </p>
        </div>

        <MedicalDisclaimer />

        {/* 输入层：每日轻量化打卡 */}
        <div className="flex flex-col gap-2 border border-zinc-200 p-4">
          <label className="text-xs uppercase text-gray-500">睡眠与恢复</label>
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
              心理压力 (0 无压力 / 10 极度焦虑)
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
              身体疲劳度 (0 满格 / 10 极度疲劳)
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
              肌肉酸痛 (0 无酸 / 10 严重酸痛 · Hooper)
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
          <div className="flex flex-col gap-2 border border-zinc-200 p-4">
            <label className="text-xs uppercase text-gray-500">生理周期监测</label>
            <div className="flex flex-col gap-1">
              <span className="text-xs text-zinc-400">上次经期开始日</span>
              <input
                type="date"
                value={periodStartDate}
                onChange={(e) => {
                  const next = e.target.value;
                  setPeriodStartDate(next);
                  if (currentUser) {
                    persistPeriodStartDate(currentUser.playerId, next);
                  }
                }}
                className="border border-zinc-300 px-3 py-2 text-sm text-zinc-900"
              />
            </div>
            <p className="text-xs leading-relaxed text-zinc-400">
              系统自动推算所处阶段：经期 1-5 天 · 卵泡 6-13 天 · 排卵 14-16 天 · 黄体 17-28 天。
            </p>
            <div className="flex items-center justify-between gap-2 border-t border-zinc-200 pt-3">
              <span className="text-xs text-zinc-500">
                近 3 个月月经是否大致规律？
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
                  规律
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
                  不规律/长期未来潮
                </button>
              </div>
            </div>
            {cycleIrregular && (
              <p className="text-xs leading-relaxed text-amber-700">
                提示：月经长期不规律可能与低能量可用性（RED-S）相关，建议优先提高能量摄入并转介专业医疗，而非仅靠减训硬撑。
              </p>
            )}
          </div>
        )}

        {/* 今日是否有新发伤病 */}
        <div className="flex flex-col gap-3 border border-zinc-200 p-4">
          <div className="flex items-center justify-between">
            <label className="text-xs uppercase text-gray-500">
              今日是否有新发伤病？
            </label>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => setHasNewInjury(false)}
                className={`border px-4 py-1.5 text-xs transition-colors ${
                  !hasNewInjury
                    ? "border-zinc-900 bg-zinc-900 text-white"
                    : "border-zinc-300 text-zinc-500 hover:bg-zinc-100"
                }`}
              >
                否
              </button>
              <button
                type="button"
                onClick={() => setHasNewInjury(true)}
                className={`border px-4 py-1.5 text-xs transition-colors ${
                  hasNewInjury
                    ? "border-red-600 bg-red-600 text-white"
                    : "border-zinc-300 text-zinc-500 hover:bg-zinc-100"
                }`}
              >
                是
              </button>
            </div>
          </div>

          {hasNewInjury && (
            <div className="flex flex-col gap-3 border-t border-zinc-200 pt-3">
              <div className="flex flex-col gap-2">
                <label className="text-xs uppercase text-gray-500">疼痛部位</label>
                <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
                  {ASSESSMENT_PAIN_AREA_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() =>
                        setNewInjuryArea(option.value as AssessmentPainArea)
                      }
                      className={`border py-2 text-xs transition-colors ${
                        newInjuryArea === option.value
                          ? "border-zinc-900 bg-zinc-900 text-white"
                          : "border-zinc-300 text-zinc-500 hover:bg-zinc-100"
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-xs uppercase text-gray-500">
                  疼痛等级 (VAS，≥{PAIN_CIRCUIT_BREAKER_THRESHOLD} 触发红色熔断)
                </label>
                <input
                  type="range"
                  min={0}
                  max={10}
                  step={1}
                  value={newInjuryScore}
                  onChange={(e) => setNewInjuryScore(Number(e.target.value))}
                  className="accent-red-600"
                />
                <div className="flex items-center justify-between text-xs text-zinc-400">
                  <span>0 无感</span>
                  <span>{PAIN_CIRCUIT_BREAKER_THRESHOLD} 熔断</span>
                  <span>10 无法忍受</span>
                </div>
                <span className="text-right font-mono text-sm text-zinc-900">
                  {newInjuryScore} · {getVasBandLabel(newInjuryScore)}
                </span>
                <p className="text-xs text-zinc-400">{VAS_SCALE_HINT}</p>
                {isNewInjuryCritical && (
                  <p className="text-xs font-semibold text-red-600">
                    ⚠️ 已触及熔断阈值，将强制归零 Readiness 分数并锁定为红牌警告。
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* 动态历史探针：仅当最近 3 天内存在未解除的伤病记录时自动插入 */}
        {recentInjuryPart && (
          <div className="flex flex-col gap-3 border border-amber-300 bg-amber-50 p-4">
            <p className="text-xs font-semibold uppercase text-amber-700">
              🔄 历史伤病追踪评估
            </p>
            <p className="text-sm leading-relaxed text-zinc-900">
              检测到你近期有「{PAIN_AREA_LABEL[recentInjuryPart]}」不适记录，请先完成一次功能性复测：
            </p>
            <p className="border border-amber-300 bg-white p-3 text-sm font-medium text-zinc-900">
              {PROBE_ACTION_DICTIONARY[recentInjuryPart]}
            </p>

            <div className="flex flex-col gap-1">
              {PROBE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setProbeFeedback(option.value)}
                  className={`border px-3 py-2 text-left text-xs transition-colors ${
                    probeFeedback === option.value
                      ? "border-zinc-900 bg-zinc-900 text-white"
                      : "border-amber-300 bg-white text-zinc-700 hover:bg-amber-100"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <button
          onClick={handleGenerate}
          disabled={!canGenerate}
          className="bg-black py-2 text-sm text-white transition-colors hover:bg-zinc-800 disabled:opacity-30"
        >
          🧠 生成今日专属训练计划
        </button>

        {/* 输出层：个性化自训计划 */}
        {result && (
          <div className={`border-2 p-4 ${TIER_META[result.tier].classes}`}>
            <div className="flex flex-col gap-1 text-xs uppercase opacity-60">
              {result.cyclePhaseLabel && <span>推算生理阶段：{result.cyclePhaseLabel}</span>}
              {result.newInjuryAreaLabel && (
                <span>新发伤病：{result.newInjuryAreaLabel}</span>
              )}
              {result.compensationAreaLabel && (
                <span>历史追踪：{result.compensationAreaLabel} · 仍在恢复期</span>
              )}
              <span>
                {TIER_META[result.tier].emoji} 档位：{TIER_META[result.tier].label}
              </span>
            </div>

            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-xs uppercase opacity-60">今日综合 Readiness</span>
              <span className="font-mono text-3xl">{result.score} / 100</span>
            </div>

            {result.vasBandLabel && (
              <p className="mt-2 text-xs opacity-70">VAS 判读：{result.vasBandLabel}</p>
            )}

            {result.cycleGuidance && (
              <div className="mt-4 border border-current/20 p-3">
                <p className="text-xs font-semibold uppercase opacity-70">
                  周期同步训练 · {result.cycleGuidance.phaseLabel}
                </p>
                <p className="mt-1 text-sm leading-relaxed">
                  {result.cycleGuidance.energyHint}
                </p>
                <ul className="mt-2 list-inside list-disc text-sm leading-relaxed opacity-90">
                  {result.cycleGuidance.trainingFocus.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
                {result.cycleGuidance.cautions.length > 0 && (
                  <p className="mt-2 text-xs opacity-70">
                    注意：{result.cycleGuidance.cautions.join("；")}
                  </p>
                )}
                {result.cycleGuidance.nutritionHints.length > 0 && (
                  <p className="mt-1 text-xs opacity-70">
                    营养：{result.cycleGuidance.nutritionHints.join("；")}
                  </p>
                )}
              </div>
            )}

            {result.showAclCues && (
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

            {result.showFemaleRedFlags && (
              <div className="mt-3 border border-amber-600 p-3">
                <p className="text-xs font-semibold uppercase text-amber-800">
                  女性健康早期警示（须转介，非诊断）
                </p>
                <ul className="mt-2 list-inside list-disc text-sm leading-relaxed">
                  {FEMALE_HEALTH_RED_FLAGS.map((flag) => (
                    <li key={flag}>{flag}</li>
                  ))}
                </ul>
              </div>
            )}

            {result.tier === "red" && (
              <div className="mt-4 border border-white/40 p-3">
                <p className="text-sm font-semibold uppercase tracking-wide">
                  🚨 红牌警告 · 伤病熔断
                </p>
                <p className="mt-2 text-sm leading-relaxed">
                  {result.redReason === "probe"
                    ? "历史伤病复测显示疼痛加剧、已明显影响动作，"
                    : "新发伤病疼痛等级突破阈值，"}
                  立刻停止任何专项与力量训练。请寻求专业医疗介入。今日任务：彻底休息与冰敷。投掷侧手臂痛时尤须停止大力传杀与下抛硬抛。
                </p>
              </div>
            )}

            {result.tier === "yellow" && (
              <div className="mt-4 flex flex-col gap-3">
                <div className="border border-zinc-300 p-3">
                  <p className="text-xs font-semibold uppercase text-zinc-500">
                    热身与防弹
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-zinc-900">
                    {hasNewInjury
                      ? INJURY_WARMUP_DICTIONARY[newInjuryArea]
                      : "常规动力链激活（髋–核心–肩胛）；疲劳/酸痛偏高时动作幅度与强度渐进爬升。"}
                  </p>
                </div>

                {result.compensationAction && (
                  <div className="border border-amber-500 bg-amber-50 p-3">
                    <p className="text-xs font-semibold uppercase text-amber-700">
                      代偿激活 (历史伤病未完全解除)
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-zinc-900">
                      {result.compensationAction}
                    </p>
                  </div>
                )}

                <div className="border border-red-500 p-3">
                  <p className="text-xs font-semibold uppercase text-red-600">
                    绝对红线
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-zinc-900">
                    禁止极限冲刺、失控急停变向与大重量深蹲新高；传杀/下抛出现疲劳信号（控球变差、臂酸加重）立即减量。
                  </p>
                </div>

                <div className="border border-zinc-300 p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase text-zinc-500">
                      专项训练
                    </p>
                    <span className="font-mono text-sm text-zinc-900">负荷 60%</span>
                  </div>
                  <ul className="mt-2 list-inside list-disc text-sm leading-relaxed text-zinc-900">
                    <li>击球点固定姿势挥击（控制发力，不追极限挥速）</li>
                    <li>落地与变向质量练习（膝盖与第二脚趾同向）</li>
                    <li>低强度传接与防守脚步，避免堆传杀与连续大力下抛</li>
                  </ul>
                </div>
              </div>
            )}

            {result.tier === "green" && (
              <div className="mt-4 flex flex-col gap-3">
                <div className="border border-zinc-300 p-3">
                  <p className="text-xs font-semibold uppercase text-zinc-500">热身</p>
                  <p className="mt-1 text-sm leading-relaxed text-zinc-900">
                    动力链激活：臀中肌、核心抗旋转、肩胛稳定；赛前动态热身，长静态拉伸放课后。
                  </p>
                </div>

                <div className="border border-zinc-900 p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase text-zinc-500">
                      专项与力量
                    </p>
                    <span className="font-mono text-sm text-zinc-900">负荷 100%</span>
                  </div>
                  <ul className="mt-2 list-inside list-disc text-sm leading-relaxed text-zinc-900">
                    <li>外野高飞球落点判断与启动</li>
                    <li>实战发力打击 / 技术密集操练</li>
                    <li>下肢爆发力与髋驱动力量（仍监控落地膝位）</li>
                  </ul>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
