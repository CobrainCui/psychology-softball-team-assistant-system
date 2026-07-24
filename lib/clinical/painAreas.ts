// 伤病部位临床术语字典：assessment / prehab 共用，避免同一部位两套措辞。

export type PainArea =
  | "shoulder"
  | "lumbar"
  | "knee"
  | "ankle"
  | "wrist";

export const PAIN_AREA_OPTIONS: { value: PainArea; label: string }[] = [
  { value: "shoulder", label: "肩部/旋转袖" },
  { value: "lumbar", label: "腰椎/下背部" },
  { value: "knee", label: "膝盖/髂胫束" },
  { value: "ankle", label: "脚踝/跟腱" },
  { value: "wrist", label: "手腕/指骨" },
];

/** 综合状态评估追踪的部位（不含尚无完整探针协议的 wrist） */
export const ASSESSMENT_PAIN_AREA_OPTIONS = PAIN_AREA_OPTIONS.filter(
  (option) => option.value !== "wrist"
);

export const PAIN_AREA_LABEL: Record<PainArea, string> = Object.fromEntries(
  PAIN_AREA_OPTIONS.map((option) => [option.value, option.label])
) as Record<PainArea, string>;

export const PAIN_CIRCUIT_BREAKER_THRESHOLD = 7;

export function isPainArea(value: unknown): value is PainArea {
  return (
    value === "shoulder" ||
    value === "lumbar" ||
    value === "knee" ||
    value === "ankle" ||
    value === "wrist"
  );
}
