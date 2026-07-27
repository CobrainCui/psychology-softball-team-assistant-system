// 伤病预防处方字典：面向满垒球（慢投 / 下抛）业余队。
// 投球为下抛弧线球，不是 Windmill 快投；肩肘负荷更多来自传杀、打击与高频比赛。
// 脚踝/手腕证据不足处仅给 RICE + 转诊，禁止编造手法。

import type { PainArea } from "@/lib/clinical/painAreas";

export type ProtocolEntry =
  | { type: "specific"; redLine: string; release: string; activation: string }
  | { type: "generic"; advice: string };

export const PREHAB_DICTIONARY: Record<PainArea, ProtocolEntry> = {
  shoulder: {
    type: "specific",
    redLine:
      "禁止带痛全力挥击、外野远距离急传与过顶大力传球；夜间痛或举手痛立即停该侧投传并评估。",
    release:
      "胸小肌/后侧肩袖网球定点压迫；禁止痛点强行拉伸。赛前用动态热身，长静态拉伸放课后。",
    activation:
      "弹力带古巴推举 + YTWL，激活肩胛稳定。满垒球下抛投球负荷相对较低，但仍须关注传杀与连场比赛后的肩袖疲劳（控球变差、臂酸加重即减量）。",
  },
  elbow: {
    type: "specific",
    redLine:
      "禁止内侧/外侧剧痛时继续大力传杀或反复下抛；避免肘过伸锁死发力。",
    release:
      "前臂屈伸肌群轻柔松解与冰敷（急性 0–72h）；明显肿胀或外翻/内翻应力痛 → 停止自助加练并就医。",
    activation:
      "先重建髋–核心旋转稳定，再做低负荷前臂抗阻与握力维持；恢复传杀/下抛须渐进加量，不追单日传接次数。",
  },
  lumbar: {
    type: "specific",
    redLine:
      "禁止硬拉新高、脊柱爆发扭转与全力挥击；满垒球击球旋转负荷高，腰痛加重即停挥。",
    release: "仰卧抱膝、网球松解臀大肌上沿；避免痛点强推伸展。",
    activation:
      "麦肯锡伸展法 + 死虫式核心抗伸展；挥击强调髋驱动与核心抗旋转，减少腰部代偿甩鞭。",
  },
  knee: {
    type: "specific",
    redLine:
      "禁止大角度负重深蹲新高、失控急停变向与长时间捕手深蹲；女性排卵窗口更须控落地与跑垒变向质量。",
    release:
      "泡沫轴大腿前侧/阔筋膜张肌，避开膝盖外侧痛点；急性肿胀先 RICE。",
    activation:
      "蚌壳式 + 侧向弹力带行走（臀中肌）；单腿落地练习膝盖与第二脚趾同向，强化腘绳肌离心控制（跑垒/防守变向）。",
  },
  ankle: {
    type: "generic",
    advice:
      "遵循 RICE（休息 / 冰敷 / 加压 / 抬高）。跑垒扭伤或无法单脚提踵时，尽快运动医学评估；暂不提供自助高强度松解处方。",
  },
  wrist: {
    type: "generic",
    advice:
      "遵循 RICE。击球握棒或接球相关腕指疼痛若影响握棒/持球，停止该动作负荷并就医；暂不提供自助强刺激处方。",
  },
};

export const INJURY_WARMUP_DICTIONARY: Record<
  Exclude<PainArea, "wrist">,
  string
> = {
  shoulder:
    "胸小肌网球松解 + 肩胛激活；今日禁止痛点大力传杀与全力挥击。关注臂酸是否随传接加重。",
  elbow:
    "前臂轻柔活动度 + 冰敷原则；禁止痛点硬传/硬抛，优先髋–核心发力。",
  lumbar: "麦肯锡定向减压 + 死虫式激活；避免脊柱扭转爆发挥击。",
  knee: "蚌壳式 + 泡沫轴大腿前侧；跑垒落地与变向先质量后强度。",
  ankle: "RICE 优先；稳定性训练前须排除结构性损伤。",
};

export const COMPENSATION_ACTIVATION_DICTIONARY: Record<
  Exclude<PainArea, "wrist">,
  string
> = {
  shoulder: "弹力带古巴推举 + YTWL，逐级激活肩胛稳定肌群。",
  elbow: "低负荷前臂抗阻 + 髋外旋/核心抗旋转，避免直接堆传杀次数。",
  lumbar: "麦肯锡伸展法 + 死虫式核心抗伸展。",
  knee: "蚌壳式 + 侧向弹力带行走激活臀中肌。",
  ankle: "弹力带足内外翻抗阻，重建踝关节本体感觉（无急性肿胀时）。",
};

export const PROBE_ACTION_DICTIONARY: Record<
  Exclude<PainArea, "wrist">,
  string
> = {
  knee: "请进行一次徒手深蹲至大腿接近平行（膝盖勿内扣）。",
  shoulder: "请进行一次靠墙天使 (Wall Angel) 或空手模拟传杀弧。",
  elbow: "请轻柔做一次屈肘抗轻阻或空手模拟下抛/传杀加速段，感受有无刺痛。",
  lumbar: "请进行一次体前屈触趾（幅度以微痛为限，勿强压）。",
  ankle: "请进行一次单脚提踵至最高点。",
};
