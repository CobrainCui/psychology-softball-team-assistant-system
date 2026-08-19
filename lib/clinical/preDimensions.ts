// 运动前五维（UI / 存储均为 1 极差 → 5 极佳）

export type Scale5 = 1 | 2 | 3 | 4 | 5;

export type PreDimensionField =
  | "sleep"
  | "stress"
  | "fatigue"
  | "soreness"
  | "willingness";

export type PreDimensionDef = {
  field: PreDimensionField;
  label: string;
  description: string;
  hint1: string;
  hint3: string;
  hint5: string;
};

export const PRE_DIMENSIONS: PreDimensionDef[] = [
  {
    field: "sleep",
    label: "睡眠恢复",
    description: "感受一下身体，昨晚睡得怎么样，现在恢复得如何？",
    hint1: "越睡越累",
    hint3: "睡眠一般",
    hint5: "神清气爽",
  },
  {
    field: "stress",
    label: "心理放松度",
    description: "留意一下面部、肩膀和呼吸，此刻心里有多放松？",
    hint1: "压力爆表",
    hint3: "轻微紧绷",
    hint5: "极度放松",
  },
  {
    field: "fatigue",
    label: "躯体精力",
    description: "感受一下四肢，此刻身体里还有多少力气？",
    hint1: "累瘫想躺",
    hint3: "微累无碍",
    hint5: "精力充沛",
  },
  {
    field: "soreness",
    label: "肌肉舒适度",
    description: "扫描一下肌肉和关节，此刻它们有多酸痛？",
    hint1: "极度酸痛",
    hint3: "正常酸胀",
    hint5: "轻松无痛",
  },
  {
    field: "willingness",
    label: "运动渴望度",
    description: "抛开别人的看法，此刻身体有多想完成今天计划的训练？",
    hint1: "本能抗拒",
    hint3: "习惯打卡",
    hint5: "迫不及待",
  },
];

export const PRE_SCAN_PROMPT =
  "花几秒，慢慢深呼吸一次。静下来，从头到脚感受一下今天的身体。";

export function clampScale5(value: unknown): Scale5 | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const n = Math.round(value);
  if (n < 1 || n > 5) return null;
  return n as Scale5;
}

/** Scale5 高分更好 → 0–10 不良分（周期/RED-S 旧接口） */
export function scale5ToWorse10(score: number): number {
  const clamped = Math.max(1, Math.min(5, score));
  return (6 - clamped) * 2;
}
