import type { HitQuality, HitResult, PitchType } from "@/lib/gameArchive";
import { HIT_RESULT_VALUES } from "@/lib/gameArchive";

export const HIT_RESULTS: HitResult[] = [...HIT_RESULT_VALUES];

export const HIT_RESULT_LABELS: Record<HitResult, string> = {
  LD: "LD | 平飞",
  FB: "FB | 高飞",
  GB: "GB | 滚地",
  PU: "PU | 冲天炮",
  MISS: "MISS | 挥空",
};

export const PITCH_TYPE_OPTIONS: { value: PitchType; label: string }[] = [
  { value: "FB", label: "FB | 直球 (Fastball)" },
  { value: "CB", label: "CB | 曲球 (Curveball)" },
  { value: "SL", label: "SL | 滑球 (Slider)" },
  { value: "CH", label: "CH | 变速球 (Changeup)" },
  { value: "OT", label: "OT | 其他 (Other)" },
];

export const PITCH_TYPE_SHORT_LABEL: Record<PitchType, string> = {
  FB: "FB | 直球",
  CB: "CB | 曲球",
  SL: "SL | 滑球",
  CH: "CH | 变速球",
  OT: "OT | 其他",
};

export const HIT_QUALITY_OPTIONS: { value: HitQuality; label: string }[] = [
  { value: "Hard", label: "Hard | 强" },
  { value: "Medium", label: "Medium | 中" },
  { value: "Soft", label: "Soft | 弱" },
];

export const HIT_QUALITY_LABELS: Record<HitQuality, string> = {
  Hard: "Hard | 强",
  Medium: "Medium | 中",
  Soft: "Soft | 弱",
};

export const ADD_CUSTOM_TEST_PANEL_ID = "__add_custom_test__";
