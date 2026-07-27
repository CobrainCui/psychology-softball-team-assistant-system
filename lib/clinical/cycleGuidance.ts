// 生理周期同步训练文案：来源 softball_search/03–04 + IOC 公开共识摘要。
// 满垒球（慢投/下抛）语境；仅作负荷管理参考，不构成医疗建议。

import type { CyclePhase } from "@/lib/clinical/cyclePhase";

export interface CycleGuidance {
  phaseLabel: string;
  energyHint: string;
  trainingFocus: string[];
  cautions: string[];
  nutritionHints: string[];
}

/** 无可靠阶段时的通用提示（激素避孕 / 高波动 / 仅症状） */
export function getSymptomDrivenGuidance(crampsScore: number): CycleGuidance {
  const highCramps = crampsScore >= 6;
  return {
    phaseLabel: "症状驱动负荷",
    energyHint: highCramps
      ? "痛经偏高：可练，优先降量而非硬撑。"
      : "阶段置信度低：以今日主观疲劳与技术质量为准。",
    trainingFocus: [
      "传杀定型、防守脚步、轻量核心",
      "避免极限冲刺、失控滑垒与重量新高",
    ],
    cautions: [
      "落地与变向仍须膝控（膝盖与第二脚趾同向）",
      highCramps ? "痛经明显时可主动降量，而非必须停训" : "仍遵守伤病红线",
    ],
    nutritionHints: ["保证水分与睡眠", "勿过度限制热量"],
  };
}

export function getCycleGuidance(phase: CyclePhase): CycleGuidance {
  if (phase.hidePhaseLabels) {
    return getSymptomDrivenGuidance(0);
  }

  if (phase.isMenstrual) {
    return {
      phaseLabel: phase.label,
      energyHint: "能量偏低属常见；可训练，不强迫高强度。",
      trainingFocus: [
        "低至中强度有氧、动态伸展、轻量核心",
        "传杀定型与击球点固定（不追求极限挥速/极限冲刺）",
      ],
      cautions: [
        "避免重量新高、极限变向与失控滑垒对抗",
        "经痛明显时可主动降量，而非必须停训",
      ],
      nutritionHints: ["注意补铁与腰腹保暖", "保证睡眠与水分"],
    };
  }

  if (phase.isFollicular) {
    return {
      phaseLabel: phase.label,
      energyHint: "全周期训练适应窗口较好，适合安排高强度刺激。",
      trainingFocus: [
        "爆发力、速度、技术密集操练",
        "可安排测试日关键项目与力量进阶",
      ],
      cautions: ["仍需遵守伤病红线与渐进加量"],
      nutritionHints: ["提高蛋白质摄入以支持肌肉合成"],
    };
  }

  if (phase.isOvulation) {
    return {
      phaseLabel: phase.label,
      energyHint: "主观力量感常较好，但韧带相对松弛，ACL 风险升高。",
      trainingFocus: [
        "可保留竞技表现与测试，但强化落地/变向质量控制",
        "穿插神经肌肉控制：单腿落地、臀中肌激活",
      ],
      cautions: [
        "禁止膝盖内扣落地与失控急停变向/滑垒",
        "疲劳叠加时优先技术质量，而非极限变向对抗",
        "腘绳肌与髋外展肌群不足时风险更高",
      ],
      nutritionHints: ["保持水分与电解质，避免带伤硬刚变向"],
    };
  }

  // 黄体期 / 黄体晚期
  return {
    phaseLabel: phase.label,
    energyHint: phase.isLateLuteal
      ? "经前窗口：体温与主观疲劳可能升高，恢复变慢。"
      : "黄体期：维持体能为主，不宜强求表现新高。",
    trainingFocus: [
      "技术练习、团队配合、力量维持",
      "缩短单次高强度区间，强调传杀与防守质量",
    ],
    cautions: [
      "散热负担上升，注意热环境与补水",
      "避免过度限制热量（与 RED-S 风险相关）",
    ],
    nutritionHints: [
      "加强补水与电解质",
      "碳水与蛋白质可略增以支持体温与恢复",
    ],
  };
}

/** 排卵期 ACL 预防短清单（教练可用，不含经期原文） */
export const ACL_PREVENTION_CUES = [
  "单腿深蹲：膝盖与第二脚趾同向，避免膝内扣",
  "侧向跳跃落地：先吸震再稳定，不塌膝",
  "弹力带髋外展 / 蚌壳式：强化臀中肌",
  "Nordic 腘绳肌离心（有条件时）",
];

/** 女性健康转介警示（三联征 / RED-S 早期信号，非诊断） */
export const FEMALE_HEALTH_RED_FLAGS = [
  "月经连续约 3 个月以上未来潮",
  "一个月内体重下降超过约 5%",
  "反复应力性骨折或骨痛",
  "对体重/饮食的过度焦虑，或精力持续显著下降",
];

/** 周期模块知情同意要点（球员端展示） */
export const CYCLE_CONSENT_POINTS = [
  "完全自愿：不记录不影响上场、评分或名册地位。",
  "数据主权：经期日期与症状默认仅本人可见。",
  "教练端仅在你授权后看到脱敏负荷标签，不显示「来例假」原文。",
  "建议仅供负荷管理参考，不构成医疗诊断或处方。",
];
