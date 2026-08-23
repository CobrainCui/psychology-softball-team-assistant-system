// 训后活动类型：预设 code 存库；自定义存原文。旧 other / 传杀防守 在读取时收口。

export const PRESET_ACTIVITY_TYPES = [
  "batting",
  "throwing_defense",
  "baserunning",
  "conditioning",
  "game",
] as const;

export type PresetActivityType = (typeof PRESET_ACTIVITY_TYPES)[number];

export const ACTIVITY_TYPE_OPTIONS: {
  value: PresetActivityType;
  label: string;
}[] = [
  { value: "batting", label: "打击" },
  { value: "throwing_defense", label: "防守" },
  { value: "baserunning", label: "跑垒" },
  { value: "conditioning", label: "体能" },
  { value: "game", label: "比赛" },
];

export const MAX_CUSTOM_ACTIVITY_LEN = 16;
export const MAX_CUSTOM_ACTIVITY_COUNT = 5;

const PRESET_SET = new Set<string>(PRESET_ACTIVITY_TYPES);

const LABEL_TO_PRESET = new Map<string, PresetActivityType>([
  ...ACTIVITY_TYPE_OPTIONS.map((o) => [o.label, o.value] as const),
  ["传杀防守", "throwing_defense"],
]);

export function isPresetActivityType(
  value: unknown
): value is PresetActivityType {
  return typeof value === "string" && PRESET_SET.has(value);
}

export function activityTypeLabel(value: string | null | undefined): string {
  if (!value) return "未分类";
  if (value === "other") return "未分类";
  const preset = ACTIVITY_TYPE_OPTIONS.find((o) => o.value === value);
  return preset?.label ?? value;
}

export function formatActivityLabels(types: string[]): string {
  const labels = types.map((t) => activityTypeLabel(t)).filter(Boolean);
  return labels.length > 0 ? labels.join("、") : "未分类";
}

/** 推导步骤：trim → 预设 code/旧标签收成 code → 其余视为自定义原文 */
export function coerceActivityTypeToken(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed === "other") return null;
  if (isPresetActivityType(trimmed)) return trimmed;
  const fromLabel = LABEL_TO_PRESET.get(trimmed);
  if (fromLabel) return fromLabel;
  return trimmed.slice(0, MAX_CUSTOM_ACTIVITY_LEN);
}

export function parseActivityTypes(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of input) {
    if (typeof raw !== "string") continue;
    const token = coerceActivityTypeToken(raw);
    if (!token || seen.has(token)) continue;
    seen.add(token);
    out.push(token);
  }
  return out;
}

export function normalizeActivityTypes(
  input: unknown
): { success: true; types: string[] } | { success: false; error: string } {
  if (!Array.isArray(input)) {
    return { success: false, error: "activityTypes 须为数组" };
  }
  const out: string[] = [];
  const seen = new Set<string>();
  let customCount = 0;
  for (const raw of input) {
    if (typeof raw !== "string") {
      return { success: false, error: "activityTypes 项须为文字" };
    }
    const trimmed = raw.trim();
    if (!trimmed || trimmed === "other") continue;
    let code: string;
    if (isPresetActivityType(trimmed)) {
      code = trimmed;
    } else {
      const fromLabel = LABEL_TO_PRESET.get(trimmed);
      if (fromLabel) {
        code = fromLabel;
      } else if (trimmed.length > MAX_CUSTOM_ACTIVITY_LEN) {
        return {
          success: false,
          error: `自定义活动最长 ${MAX_CUSTOM_ACTIVITY_LEN} 字`,
        };
      } else {
        code = trimmed;
      }
    }
    if (seen.has(code)) continue;
    if (!isPresetActivityType(code)) {
      customCount += 1;
      if (customCount > MAX_CUSTOM_ACTIVITY_COUNT) {
        return {
          success: false,
          error: `自定义活动最多 ${MAX_CUSTOM_ACTIVITY_COUNT} 项`,
        };
      }
    }
    seen.add(code);
    out.push(code);
  }
  if (out.length === 0) {
    return { success: false, error: "请至少选择一项活动类型" };
  }
  return { success: true, types: out };
}

export const FATIGUE_SCALE_TICKS: { value: number; label: string }[] = [
  { value: 1, label: "几乎不累" },
  { value: 2, label: "很轻松" },
  { value: 3, label: "轻松" },
  { value: 4, label: "略感吃力" },
  { value: 5, label: "有些吃力" },
  { value: 6, label: "比较吃力" },
  { value: 7, label: "很吃力" },
  { value: 8, label: "非常吃力" },
  { value: 9, label: "接近极限" },
  { value: 10, label: "极限" },
];

export function fatigueTickLabel(value: number): string {
  return FATIGUE_SCALE_TICKS.find((t) => t.value === value)?.label ?? "";
}
