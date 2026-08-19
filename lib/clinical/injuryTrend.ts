import { PAIN_AREA_LABEL, type PainArea } from "@/lib/clinical/painAreas";

export const INJURY_TREND_RULE_VERSION = "injury_trend_v0.2";
export const INSUFFICIENT_TREND_LABEL = "记录数据不足";

export type InjuryTrendDirection =
  | "rising"
  | "falling"
  | "stable"
  | "insufficient";

export type InjuryPainLogPoint = {
  date: string;
  painScore: number;
  createdAt: string;
};

export type CasePainTrendView = {
  direction: InjuryTrendDirection;
  label: string;
  narrative: string;
  series: { date: string; score: number }[];
};

function buildSeriesFromPainLogs(
  logs: InjuryPainLogPoint[]
): { date: string; score: number }[] {
  const byDate = new Map<string, InjuryPainLogPoint>();
  for (const log of logs) {
    const prev = byDate.get(log.date);
    if (!prev || log.createdAt >= prev.createdAt) {
      byDate.set(log.date, log);
    }
  }
  return [...byDate.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([date, log]) => ({ date, score: log.painScore }));
}

export function trendDirectionLabel(direction: InjuryTrendDirection): string {
  switch (direction) {
    case "rising":
      return "疼痛加重";
    case "falling":
      return "稳步康复中";
    case "stable":
      return "疼痛持续，继续关注";
    case "insufficient":
    default:
      return INSUFFICIENT_TREND_LABEL;
  }
}

export function buildCasePainTrendNarrative(
  direction: InjuryTrendDirection,
  areaLabel: string
): string {
  switch (direction) {
    case "rising":
      return `最近几次记录里，你打的${areaLabel}疼痛分数在慢慢上升——身体在提醒你，需要多留意它。\n\n可以考虑调整传杀、打击或跑垒计划；如果疼痛持续加重或影响日常活动，建议暂停训练并咨询专业人员。`;
    case "stable":
      return `近几次记录中，你的${areaLabel}疼痛分数变化不大。\n疼痛仍在持续，建议暂时不要增加训练量或强度，并继续观察它与训练的关系。`;
    case "falling":
      return `近几次记录中，你的${areaLabel}疼痛分数在下降。\n这说明不适有所缓解；如要恢复训练，建议循序渐进，不要因为疼痛减轻就贸然恢复原来的强度。`;
    case "insufficient":
    default:
      return "目前记录少于 3 天，暂时还看不出疼痛变化趋势。继续记录后，系统会帮你观察变化。";
  }
}

function resolveTrendDirection(
  series: { date: string; score: number }[]
): InjuryTrendDirection {
  if (series.length < 3) return "insufficient";
  const first = series[0]!.score;
  const last = series[series.length - 1]!.score;
  const deltas: number[] = [];
  for (let i = 1; i < series.length; i++) {
    deltas.push(series[i]!.score - series[i - 1]!.score);
  }
  const up = deltas.filter((d) => d > 0).length;
  const down = deltas.filter((d) => d < 0).length;
  if (last - first >= 2 && up >= down) return "rising";
  if (first - last >= 2 && down >= up) return "falling";
  return "stable";
}

export function computeCasePainTrend(params: {
  painArea: PainArea;
  painLogs: InjuryPainLogPoint[];
}): CasePainTrendView {
  const series = buildSeriesFromPainLogs(params.painLogs);
  const areaLabel = PAIN_AREA_LABEL[params.painArea];
  const direction = resolveTrendDirection(series);
  return {
    direction,
    label: trendDirectionLabel(direction),
    narrative: buildCasePainTrendNarrative(direction, areaLabel),
    series,
  };
}

export function computePainTrendFromSeries(
  series: { date: string; score: number }[]
): InjuryTrendDirection {
  return resolveTrendDirection(series);
}
