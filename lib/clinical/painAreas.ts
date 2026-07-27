// 伤病部位临床术语字典：assessment / prehab / Prisma PainArea 共用。

export type PainArea =
  | "shoulder"
  | "elbow"
  | "lumbar"
  | "knee"
  | "ankle"
  | "wrist";

export const PAIN_AREA_OPTIONS: { value: PainArea; label: string }[] = [
  { value: "shoulder", label: "肩部/旋转袖" },
  { value: "elbow", label: "肘部/内侧副韧带区" },
  { value: "lumbar", label: "腰椎/下背部" },
  { value: "knee", label: "膝盖/髂胫束" },
  { value: "ankle", label: "脚踝/跟腱" },
  { value: "wrist", label: "手腕/指骨" },
];

/** 综合状态评估可追踪部位（含探针协议；不含 wrist） */
export const ASSESSMENT_PAIN_AREA_OPTIONS = PAIN_AREA_OPTIONS.filter(
  (option) => option.value !== "wrist"
);

export const PAIN_AREA_LABEL: Record<PainArea, string> = Object.fromEntries(
  PAIN_AREA_OPTIONS.map((option) => [option.value, option.label])
) as Record<PainArea, string>;

/** 与公开 VAS 整理对齐：≥6 倾向停训就医 */
export const PAIN_CIRCUIT_BREAKER_THRESHOLD = 6;

export function isPainArea(value: unknown): value is PainArea {
  return (
    value === "shoulder" ||
    value === "elbow" ||
    value === "lumbar" ||
    value === "knee" ||
    value === "ankle" ||
    value === "wrist"
  );
}
