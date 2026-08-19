// 伤病部位临床术语字典：评估不采集伤病；损伤 episode / Prisma PainArea 共用。

export type PainArea =
  | "shoulder"
  | "elbow"
  | "lumbar"
  | "knee"
  | "ankle"
  | "wrist"
  | "hip"
  | "other";

export const PAIN_AREA_OPTIONS: { value: PainArea; label: string }[] = [
  { value: "shoulder", label: "肩部" },
  { value: "elbow", label: "肘部" },
  { value: "lumbar", label: "腰部" },
  { value: "knee", label: "膝盖" },
  { value: "ankle", label: "脚踝" },
  { value: "wrist", label: "手腕" },
  { value: "hip", label: "髋部" },
  { value: "other", label: "其他" },
];

export const PAIN_AREA_LABEL: Record<PainArea, string> = Object.fromEntries(
  PAIN_AREA_OPTIONS.map((option) => [option.value, option.label])
) as Record<PainArea, string>;

export function isPainArea(value: unknown): value is PainArea {
  return PAIN_AREA_OPTIONS.some((option) => option.value === value);
}
