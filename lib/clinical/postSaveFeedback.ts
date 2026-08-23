// 训后保存成功确认：活动类型 + 疲劳程度；活跃损伤提示不依赖时长。

import {
  fatigueTickLabel,
  formatActivityLabels,
} from "@/lib/clinical/activityTypes";
import { PAIN_AREA_LABEL, type PainArea } from "@/lib/clinical/painAreas";

export type PostSessionRow = {
  id: string;
  date: string;
  activityTypes: string[];
  sessionRpe: number;
};

export type ActiveInjuryBrief = {
  painArea: PainArea;
};

export type PostSaveFeedbackView = {
  sessionLine: string;
  injuryContextVisible: boolean;
  injuryContextText: string;
};

function buildActiveInjuryContext(cases: ActiveInjuryBrief[]): string | null {
  if (cases.length === 0) return null;
  const labels = cases.map((c) => PAIN_AREA_LABEL[c.painArea]);
  return `你有正在康复中的${labels.join("、")}损伤。训练后如有不适，可以补充疼痛记录。`;
}

export function buildPostSaveFeedback(params: {
  savedPost: PostSessionRow;
  activeInjuries: ActiveInjuryBrief[];
}): PostSaveFeedbackView {
  const tick = fatigueTickLabel(params.savedPost.sessionRpe);
  const sessionLine = `${formatActivityLabels(params.savedPost.activityTypes)} · 疲劳程度 ${params.savedPost.sessionRpe}${tick ? ` · ${tick}` : ""}`;
  const injuryContextText = buildActiveInjuryContext(params.activeInjuries);
  return {
    sessionLine,
    injuryContextVisible: Boolean(injuryContextText),
    injuryContextText: injuryContextText ?? "",
  };
}
