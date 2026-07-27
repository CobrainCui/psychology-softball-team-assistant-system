// VAS / NRS 分档：对齐《运动伤病与状态监控》公开整理（非诊断）。
// 0–2 可训留意｜3–5 减量｜≥6 停训就医倾向｜≥9 紧急就医

import { PAIN_CIRCUIT_BREAKER_THRESHOLD } from "@/lib/clinical/painAreas";

export function getVasBandLabel(score: number): string {
  if (score <= 2) return "轻度：可正常训练，持续观察";
  if (score <= 5) return "中度：建议该部位减负约 50%，避免极限发力";
  if (score <= 8) return "重度：停止专项与力量训练，建议就医评估";
  return "极重度：立即寻求专业医疗介入";
}

export function isVasCircuitBreak(score: number): boolean {
  return score >= PAIN_CIRCUIT_BREAKER_THRESHOLD;
}

export const VAS_SCALE_HINT =
  "VAS 0–2 可训留意 · 3–5 减量避负重 · ≥6 停训就医 · 9–10 紧急就医";
