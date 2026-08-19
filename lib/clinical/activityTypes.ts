export type ActivityType =
  | "batting"
  | "throwing_defense"
  | "baserunning"
  | "conditioning"
  | "game"
  | "other";

export const ACTIVITY_TYPE_OPTIONS: { value: ActivityType; label: string }[] = [
  { value: "batting", label: "打击" },
  { value: "throwing_defense", label: "传杀防守" },
  { value: "baserunning", label: "跑垒" },
  { value: "conditioning", label: "体能" },
  { value: "game", label: "比赛" },
  { value: "other", label: "其他" },
];

export const ACTIVITY_TYPE_LABEL: Record<ActivityType, string> = Object.fromEntries(
  ACTIVITY_TYPE_OPTIONS.map((o) => [o.value, o.label])
) as Record<ActivityType, string>;

export function isActivityType(value: unknown): value is ActivityType {
  return ACTIVITY_TYPE_OPTIONS.some((o) => o.value === value);
}

export function activityTypeLabel(value: ActivityType | null | undefined): string {
  if (!value) return ACTIVITY_TYPE_LABEL.other;
  return ACTIVITY_TYPE_LABEL[value] ?? ACTIVITY_TYPE_LABEL.other;
}

export function computeSessionLoad(sessionRpe: number, durationMin: number): number {
  return Math.round(sessionRpe * Math.max(0, durationMin));
}

export const RPE_SCALE_TICKS: { value: number; label: string }[] = [
  { value: 1, label: "非常轻松" },
  { value: 2, label: "" },
  { value: 3, label: "轻松" },
  { value: 4, label: "" },
  { value: 5, label: "有些吃力" },
  { value: 6, label: "" },
  { value: 7, label: "很吃力" },
  { value: 8, label: "" },
  { value: 9, label: "接近极限" },
  { value: 10, label: "极限" },
];

export const RPE_MINDFUL_PROMPT =
  "抛开配速和别人的眼光，刚才这场训练，身体有多累？";

export const DURATION_HINT =
  "训练持续时间：包含热身、正式训练和计划内间歇；不包含更衣、通勤及与训练无关的长时间中断。";
