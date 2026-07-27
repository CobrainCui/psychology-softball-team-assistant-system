// 症状门控：在部位字典之上叠加刺痛/弹响/无力分支（规则引擎，非诊断）。

import type { PainArea } from "@/lib/clinical/painAreas";
import {
  PREHAB_DICTIONARY,
  type ProtocolEntry,
} from "@/lib/clinical/prehabProtocols";

export type PrehabSymptom = "sharp" | "dull" | "click" | "weak";

export const PREHAB_SYMPTOM_OPTIONS: {
  value: PrehabSymptom;
  label: string;
}[] = [
  { value: "sharp", label: "刺痛/拉扯感" },
  { value: "dull", label: "隐隐钝痛" },
  { value: "click", label: "关节弹响/卡顿" },
  { value: "weak", label: "无力感" },
];

export function isPrehabSymptom(value: unknown): value is PrehabSymptom {
  return (
    value === "sharp" ||
    value === "dull" ||
    value === "click" ||
    value === "weak"
  );
}

export function prehabSymptomLabel(symptom: PrehabSymptom): string {
  return (
    PREHAB_SYMPTOM_OPTIONS.find((option) => option.value === symptom)?.label ??
    symptom
  );
}

/** 刺痛/弹响：禁止高强度激活，升转诊权重 */
const ELEVATED_REFERRAL_NOTE =
  "症状含刺痛或弹响/卡顿：停止自助高强度松解与激活；优先休息与冰敷，尽快运动医学评估（非本系统诊断）。";

/** 无力：优先动力链，降低传杀/挥击负荷文案 */
const WEAKNESS_LOAD_NOTE =
  "伴无力感：今日禁止堆传杀次数与全力挥击；先做低负荷动力链激活（髋–核心–肩胛），再评估是否恢复专项。";

// 推导步骤：取部位字典 → sharp/click 覆盖为转诊优先 → weak 追加减负说明 → dull 原样
export function resolvePrehabProtocol(
  painArea: PainArea,
  symptom: PrehabSymptom
): ProtocolEntry {
  const base = PREHAB_DICTIONARY[painArea];

  if (symptom === "sharp" || symptom === "click") {
    if (base.type === "generic") {
      return {
        type: "generic",
        advice: `${ELEVATED_REFERRAL_NOTE} ${base.advice}`,
      };
    }
    return {
      type: "specific",
      redLine: `${ELEVATED_REFERRAL_NOTE} ${base.redLine}`,
      release: "仅允许轻柔活动度与冰敷原则；禁止痛点强刺激与大力拉伸。",
      activation:
        "今日不做高强度代偿激活。排除结构性问题并经专业评估前，保持该部位减负。",
    };
  }

  if (symptom === "weak") {
    if (base.type === "generic") {
      return {
        type: "generic",
        advice: `${WEAKNESS_LOAD_NOTE} ${base.advice}`,
      };
    }
    return {
      type: "specific",
      redLine: `${WEAKNESS_LOAD_NOTE} ${base.redLine}`,
      release: base.release,
      activation: `${base.activation} 以低负荷、可控质量为先，不追组数。`,
    };
  }

  return base;
}
