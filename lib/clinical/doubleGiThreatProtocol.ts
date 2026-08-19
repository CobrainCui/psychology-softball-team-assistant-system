// 【待开发 · 未接线】赛前双重肠胃危机干预 (The Double-GI-Threat Protocol)
// 依赖尚未落地的能力：重要比赛日 / 赛季日历 / 训练期·赛季·休息期标记。
// 解冻条件：赛程模块可标记「重要比赛日（高压）」后，再与 cyclePhase Day 1–3 联动弹窗。
// 禁止在无赛程信号时硬编码触发；本文件仅作规则与文案存档。

import type { CyclePhase } from "@/lib/clinical/cyclePhase";

/** 协议标识：便于日后评估页 / 赛程页按 id 引用 */
export const DOUBLE_GI_THREAT_PROTOCOL_ID = "double_gi_threat" as const;

export const DOUBLE_GI_THREAT_TITLE =
  "赛前双重肠胃危机干预 (The Double-GI-Threat Protocol)";

/**
 * 触发条件（Algorithm Trigger）
 * 重要比赛日（高压）∧ 女性经期 Day 1–3 → 红色预警弹窗
 */
export type DoubleGiThreatTriggerInput = {
  /** 赛程尚未落地：由未来「重要比赛日」标记提供 */
  isHighPressureGameDay: boolean;
  /** 已有周期推算：经期且 dayOfCycle ∈ [1, 3] */
  cyclePhase: CyclePhase | null;
};

export function shouldTriggerDoubleGiThreat(
  input: DoubleGiThreatTriggerInput
): boolean {
  if (!input.isHighPressureGameDay) return false;
  const phase = input.cyclePhase;
  if (!phase || phase.hidePhaseLabels || !phase.isMenstrual) return false;
  return phase.dayOfCycle >= 1 && phase.dayOfCycle <= 3;
}

/** 病理科普（队员端原理解释） */
export const DOUBLE_GI_THREAT_PATHOPHYSIOLOGY = {
  headline: "为什么会拉肚子？",
  mechanism:
    "赛前极度紧张（交感神经剥夺肠胃供血）＋经期前列腺素狂飙（促使平滑肌暴力痉挛）＝肠道系统的「双重海啸」。",
} as const;

/** 强制执行处方：赛前 24h 饮食封杀令 */
export const DOUBLE_GI_THREAT_DIET_BAN = {
  title: "赛前 24 小时饮食封杀令",
  banned: [
    "高果糖水果（西瓜 / 葡萄）",
    "高粗纤维（沙拉 / 韭菜）",
    "冰镇饮料",
  ],
  allowed:
    "只允许摄入温热的、极易消化的精细碳水（粥、面、面包）。",
} as const;

/** 电解质回填战术 */
export const DOUBLE_GI_THREAT_ELECTROLYTE = {
  title: "电解质回填战术（Electrolyte Rehydration）",
  warning:
    "拉肚子后严禁狂饮纯白开水（可能导致低钠血症，引发比赛中大腿抽筋）。",
  solution:
    "强制携带常温等渗饮料（如宝矿力）或口服补液盐 / 温盐糖水；赛前 1 小时内小口、持续啜饮。",
} as const;

/** 弹窗 / Checklist 聚合（UI 接线时直接消费） */
export const DOUBLE_GI_THREAT_PROTOCOL = {
  id: DOUBLE_GI_THREAT_PROTOCOL_ID,
  title: DOUBLE_GI_THREAT_TITLE,
  severity: "red" as const,
  pathophysiology: DOUBLE_GI_THREAT_PATHOPHYSIOLOGY,
  checklist: {
    dietBan: DOUBLE_GI_THREAT_DIET_BAN,
    electrolyte: DOUBLE_GI_THREAT_ELECTROLYTE,
  },
  /** 产品边界：负荷与赛前自我管理参考，不构成医疗诊断 */
  disclaimer:
    "本协议为队内赛前自我管理参考，不替代执业医师诊断。持续剧烈腹痛、便血或脱水须就医。",
} as const;
