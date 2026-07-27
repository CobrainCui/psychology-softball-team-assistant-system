// 教练端脱敏生理负荷标签：禁止暴露经期日期/出血/痛经原文。
// 错误示范：「月经第二天」→ 正确：「生理疲劳指数高，建议…」

import type { CyclePhase } from "@/lib/clinical/cyclePhase";

export type PhysiologicalLoadTag =
  | "recover_high"
  | "acl_caution"
  | "maintain"
  | "peak_ok"
  | "monitor_health";

export const LOAD_TAG_COACH_HINT: Record<PhysiologicalLoadTag, string> = {
  recover_high: "建议降下肢负重与极限变向，改上肢技战术；关注恢复。",
  acl_caution: "强化落地/膝控热身，限制失控急停变向与滑垒对抗。",
  maintain: "维持量，缩短高强度区间，强调技术质量。",
  peak_ok: "可安排测试/爆发力（仍受伤病红线约束）。",
  monitor_health: "建议队医/防护跟进（细节未共享）。",
};

export const LOAD_TAG_LABEL: Record<PhysiologicalLoadTag, string> = {
  recover_high: "恢复需求偏高",
  acl_caution: "变向/落地谨慎",
  maintain: "维持负荷",
  peak_ok: "可冲击窗口",
  monitor_health: "健康跟进",
};

export type ResolveLoadTagInput = {
  phase: CyclePhase | null;
  fatigueScore: number;
  sorenessScore: number;
  crampsScore: number;
  redsTriggered: boolean;
};

// 推导步骤：RED-S 优先 → 症状/经期高负荷 → 排卵 ACL → 黄体维持 → 卵泡可冲击
export function resolvePhysiologicalLoadTag(
  input: ResolveLoadTagInput
): PhysiologicalLoadTag | null {
  const { phase, fatigueScore, sorenessScore, crampsScore, redsTriggered } =
    input;

  if (redsTriggered) return "monitor_health";

  const highFatigue = Math.max(fatigueScore, sorenessScore) >= 6;
  const highCramps = crampsScore >= 6;

  if (!phase || phase.hidePhaseLabels) {
    if (highCramps || (highFatigue && crampsScore >= 4)) return "recover_high";
    return null;
  }

  if (phase.isMenstrual && (highCramps || highFatigue)) return "recover_high";
  if (phase.isOvulation) return "acl_caution";
  if (phase.isLateLuteal || (phase.isLuteal && highFatigue)) return "maintain";
  if (phase.isFollicular && !highFatigue) return "peak_ok";
  if (phase.isLuteal) return "maintain";
  if (phase.isMenstrual) return "maintain";
  return null;
}
