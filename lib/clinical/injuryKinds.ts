export type InjuryKind =
  | "overuse"
  | "acute_strain"
  | "contusion"
  | "inflammation"
  | "post_care"
  | "unclear";

export type InjuryCaseStatus = "active" | "recovered";

export type InjuryNoteKind = "treatment" | "rehab";

export type PainExerciseRelationId =
  | "relieves_after_warmup"
  | "worsens_with_exercise"
  | "relieves_with_rest"
  | "unrelated_to_exercise";

export const INJURY_KIND_OPTIONS: {
  id: InjuryKind;
  label: string;
  hint: string;
}[] = [
  { id: "overuse", label: "劳损", hint: "反复训练、无明确单次受伤" },
  { id: "acute_strain", label: "急性受伤", hint: "某一次扭伤、拉伤" },
  { id: "contusion", label: "撞击挫伤", hint: "碰撞、跌倒、被击中" },
  { id: "inflammation", label: "炎症肿胀", hint: "发红发热、持续肿胀" },
  { id: "post_care", label: "治疗后", hint: "手术或正规治疗之后" },
  { id: "unclear", label: "说不清", hint: "暂无法归类" },
];

export const INJURY_KIND_LABEL: Record<InjuryKind, string> = Object.fromEntries(
  INJURY_KIND_OPTIONS.map((o) => [o.id, o.label])
) as Record<InjuryKind, string>;

export function isInjuryKind(value: unknown): value is InjuryKind {
  return INJURY_KIND_OPTIONS.some((o) => o.id === value);
}

export const PAIN_EXERCISE_RELATION_OPTIONS: {
  id: PainExerciseRelationId;
  label: string;
}[] = [
  { id: "relieves_after_warmup", label: "热身后会缓解" },
  { id: "worsens_with_exercise", label: "运动会加重" },
  { id: "relieves_with_rest", label: "休息时会缓解" },
  { id: "unrelated_to_exercise", label: "疼痛程度与运动无关" },
];

export function isPainExerciseRelation(
  value: unknown
): value is PainExerciseRelationId {
  return PAIN_EXERCISE_RELATION_OPTIONS.some((o) => o.id === value);
}

export const PAIN_SCALE_TICKS: { value: number; label: string }[] = [
  { value: 0, label: "无痛" },
  { value: 1, label: "几乎无感" },
  { value: 2, label: "轻微" },
  { value: 3, label: "很轻" },
  { value: 4, label: "轻度" },
  { value: 5, label: "中等" },
  { value: 6, label: "中度" },
  { value: 7, label: "较重" },
  { value: 8, label: "明显" },
  { value: 9, label: "很重" },
  { value: 10, label: "剧烈" },
];

export function painScoreText(score: number): string {
  const label = PAIN_SCALE_TICKS.find((t) => t.value === score)?.label;
  return label ? `${score}/10（${label}）` : `${score}/10`;
}
