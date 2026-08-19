// 训后保存成功页：本次/当日负荷相对个人基线比较（非绝对分带）。

import { activityTypeLabel, type ActivityType } from "@/lib/clinical/activityTypes";
import { PAIN_AREA_LABEL, type PainArea } from "@/lib/clinical/painAreas";

export type LoadCompareLevel = "high" | "medium" | "low";

export type LoadExplainView = {
  mainLine: string;
  detailLine: string;
};

export type PostSessionRow = {
  id: string;
  date: string;
  activityType?: ActivityType | null;
  sessionRpe: number;
  durationMin: number;
  sessionLoad: number;
  savedAt?: string;
};

export type ActiveInjuryBrief = {
  painArea: PainArea;
};

export type PostSaveFeedbackView = {
  sessionLine: string;
  sessionLoad: number;
  sessionLoadInsufficient: boolean;
  sessionLoadInsufficientText: string;
  sessionLoadExplain: LoadExplainView | null;
  dailyVisible: boolean;
  dailyCountLine: string;
  dailyTotalLine: string;
  dailyLoadInsufficient: boolean;
  dailyLoadInsufficientText: string;
  dailyLoadExplain: LoadExplainView | null;
  preContextVisible: boolean;
  preContextText: string;
  injuryContextVisible: boolean;
  injuryContextText: string;
};

const SESSION_BASELINE_CAP = 14;
const DAILY_BASELINE_CAP = 14;
const EARLY_HISTORY_HINT =
  "当前历史记录仍较少，继续记录后，个人比较会更稳定。";

function comparePostSessionsAsc(a: PostSessionRow, b: PostSessionRow): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  const aSaved = a.savedAt ?? "";
  const bSaved = b.savedAt ?? "";
  if (aSaved !== bSaved) return aSaved < bSaved ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function percentile(sorted: number[], p: number): number {
  const n = sorted.length;
  if (n === 0) return 0;
  if (n === 1) return sorted[0]!;
  const idx = (n - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo]!;
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (idx - lo);
}

function loadThresholds(
  totalRecords: number,
  baselineLoads: number[]
): { lower: number; upper: number } {
  const sorted = [...baselineLoads].sort((a, b) => a - b);
  if (totalRecords >= 14) {
    return {
      lower: percentile(sorted, 0.25),
      upper: percentile(sorted, 0.75),
    };
  }
  return {
    lower: percentile(sorted, 0.2),
    upper: percentile(sorted, 0.8),
  };
}

function compareLoadWithTier(
  load: number,
  totalRecords: number,
  baselineLoads: number[]
): LoadCompareLevel {
  if (baselineLoads.length === 0) return "medium";
  const { lower, upper } = loadThresholds(totalRecords, baselineLoads);
  if (load > upper) return "high";
  if (load < lower) return "low";
  return "medium";
}

function dailyLoadsByDate(posts: PostSessionRow[]): Map<string, number> {
  const byDate = new Map<string, number>();
  for (const p of posts) {
    byDate.set(p.date, (byDate.get(p.date) ?? 0) + p.sessionLoad);
  }
  return byDate;
}

function priorTrainingDayLoads(
  byDate: Map<string, number>,
  beforeDate: string,
  limit: number
): number[] {
  const dates = [...byDate.keys()]
    .filter((d) => d < beforeDate && (byDate.get(d) ?? 0) > 0)
    .sort();
  const loads = dates.map((d) => byDate.get(d) ?? 0);
  return loads.length > limit ? loads.slice(-limit) : loads;
}

function priorSessionLoads(prior: PostSessionRow[], limit: number): number[] {
  const loads = prior.map((s) => s.sessionLoad);
  return loads.length > limit ? loads.slice(-limit) : loads;
}

function buildSessionLoadExplainView(
  level: LoadCompareLevel,
  baselineCount: number,
  totalRecords: number
): LoadExplainView {
  if (totalRecords < 14) {
    if (level === "high") {
      return {
        mainLine: "初步判断本次负荷相对近期记录偏高。",
        detailLine: EARLY_HISTORY_HINT,
      };
    }
    if (level === "low") {
      return {
        mainLine: "初步判断本次负荷相对近期记录偏低。",
        detailLine: EARLY_HISTORY_HINT,
      };
    }
    return {
      mainLine: "初步判断，本次负荷与近期记录相比处于常见范围内。",
      detailLine: EARLY_HISTORY_HINT,
    };
  }
  if (level === "high") {
    return {
      mainLine: "本次负荷相对你近期训练偏高。",
      detailLine: `高于你近 ${baselineCount} 次训练中的大多数记录。`,
    };
  }
  if (level === "low") {
    return {
      mainLine: "本次负荷相对你近期训练偏低。",
      detailLine: `低于你近 ${baselineCount} 次训练中的大多数记录。`,
    };
  }
  return {
    mainLine: "本次负荷处于你近期常见范围内。",
    detailLine: "",
  };
}

function buildDailyLoadExplainView(
  level: LoadCompareLevel,
  baselineDayCount: number,
  totalRecords: number
): LoadExplainView {
  if (totalRecords < 14) {
    if (level === "high") {
      return {
        mainLine: "初步判断当日累计负荷相对近期记录偏高。",
        detailLine: EARLY_HISTORY_HINT,
      };
    }
    if (level === "low") {
      return {
        mainLine: "初步判断当日累计负荷相对近期记录偏低。",
        detailLine: EARLY_HISTORY_HINT,
      };
    }
    return {
      mainLine: "初步判断，当日累计负荷与近期记录相比处于常见范围内。",
      detailLine: EARLY_HISTORY_HINT,
    };
  }
  if (level === "high") {
    return {
      mainLine: "当日累计负荷相对你近期训练偏高。",
      detailLine: `高于你近 ${baselineDayCount} 个训练日中的大多数记录。`,
    };
  }
  if (level === "low") {
    return {
      mainLine: "当日累计负荷相对你近期训练偏低。",
      detailLine: `低于你近 ${baselineDayCount} 个训练日中的大多数记录。`,
    };
  }
  return {
    mainLine: "当日累计负荷处于你近期常见范围内。",
    detailLine: "",
  };
}

function buildSessionLoadExplain(
  savedPost: PostSessionRow,
  allPosts: PostSessionRow[]
): {
  sessionLoadInsufficient: boolean;
  sessionLoadInsufficientText: string;
  sessionLoadExplain: LoadExplainView | null;
  sessionLevel: LoadCompareLevel;
} {
  const asc = [...allPosts].sort(comparePostSessionsAsc);
  const total = asc.length;
  const idx = asc.findIndex((s) => s.id === savedPost.id);
  const prior = idx > 0 ? asc.slice(0, idx) : [];

  if (total < 8) {
    return {
      sessionLoadInsufficient: true,
      sessionLoadInsufficientText: "记录不足，暂不进行本次训练负荷比较。",
      sessionLoadExplain: null,
      sessionLevel: "medium",
    };
  }

  const baselineLoads = priorSessionLoads(prior, SESSION_BASELINE_CAP);
  const sessionLevel = compareLoadWithTier(
    savedPost.sessionLoad,
    total,
    baselineLoads
  );
  return {
    sessionLoadInsufficient: false,
    sessionLoadInsufficientText: "",
    sessionLoadExplain: buildSessionLoadExplainView(
      sessionLevel,
      baselineLoads.length,
      total
    ),
    sessionLevel,
  };
}

function buildDailyExplain(
  savedPost: PostSessionRow,
  allPosts: PostSessionRow[],
  todaySessionCount: number
): {
  dailyVisible: boolean;
  dailyCountLine: string;
  dailyTotalLine: string;
  dailyLoadInsufficient: boolean;
  dailyLoadInsufficientText: string;
  dailyLoadExplain: LoadExplainView | null;
} {
  if (todaySessionCount <= 1) {
    return {
      dailyVisible: false,
      dailyCountLine: "",
      dailyTotalLine: "",
      dailyLoadInsufficient: false,
      dailyLoadInsufficientText: "",
      dailyLoadExplain: null,
    };
  }

  const total = allPosts.length;
  const byDate = dailyLoadsByDate(allPosts);
  const todayTotal = byDate.get(savedPost.date) ?? 0;
  const dailyCountLine = `今天已完成 ${todaySessionCount} 次训练。`;
  const dailyTotalLine = `今日累计负荷：${todayTotal}`;

  if (total < 8) {
    return {
      dailyVisible: true,
      dailyCountLine,
      dailyTotalLine,
      dailyLoadInsufficient: true,
      dailyLoadInsufficientText: "记录不足，暂不进行当天累计训练负荷比较。",
      dailyLoadExplain: null,
    };
  }

  const priorDailyLoads = priorTrainingDayLoads(
    byDate,
    savedPost.date,
    DAILY_BASELINE_CAP
  );
  const dailyLevel = compareLoadWithTier(todayTotal, total, priorDailyLoads);
  return {
    dailyVisible: true,
    dailyCountLine,
    dailyTotalLine,
    dailyLoadInsufficient: false,
    dailyLoadInsufficientText: "",
    dailyLoadExplain: buildDailyLoadExplainView(
      dailyLevel,
      priorDailyLoads.length,
      total
    ),
  };
}

function buildPreContext(
  sessionLevel: LoadCompareLevel,
  todayPhysicalBattery: number | null
): string | null {
  if (sessionLevel !== "high") return null;
  if (todayPhysicalBattery == null || todayPhysicalBattery >= 3) return null;
  return [
    "运动前身体状态偏低，但本次负荷相对你近期训练偏高。",
    "如果今天还有训练计划，可以考虑降低后续传杀与跑垒强度。",
  ].join("\n");
}

function buildActiveInjuryContext(cases: ActiveInjuryBrief[]): string | null {
  if (cases.length === 0) return null;
  const labels = cases.map((c) => PAIN_AREA_LABEL[c.painArea]);
  return `你有正在康复中的${labels.join("、")}损伤。训练后如有不适，可以补充疼痛记录。`;
}

export function buildPostSaveFeedback(params: {
  savedPost: PostSessionRow;
  allPosts: PostSessionRow[];
  todaySessionCount: number;
  todayPhysicalBattery: number | null;
  activeInjuries: ActiveInjuryBrief[];
}): PostSaveFeedbackView {
  const { savedPost, allPosts, todaySessionCount } = params;
  const sessionLine = `${activityTypeLabel(savedPost.activityType)} · ${savedPost.durationMin} 分钟 · 主观运动强度 ${savedPost.sessionRpe}`;
  const sessionExplain = buildSessionLoadExplain(savedPost, allPosts);
  const dailyExplain = buildDailyExplain(
    savedPost,
    allPosts,
    todaySessionCount
  );
  const preContextText = buildPreContext(
    sessionExplain.sessionLevel,
    params.todayPhysicalBattery
  );
  const injuryContextText = buildActiveInjuryContext(params.activeInjuries);

  return {
    sessionLine,
    sessionLoad: savedPost.sessionLoad,
    sessionLoadInsufficient: sessionExplain.sessionLoadInsufficient,
    sessionLoadInsufficientText: sessionExplain.sessionLoadInsufficientText,
    sessionLoadExplain: sessionExplain.sessionLoadExplain,
    dailyVisible: dailyExplain.dailyVisible,
    dailyCountLine: dailyExplain.dailyCountLine,
    dailyTotalLine: dailyExplain.dailyTotalLine,
    dailyLoadInsufficient: dailyExplain.dailyLoadInsufficient,
    dailyLoadInsufficientText: dailyExplain.dailyLoadInsufficientText,
    dailyLoadExplain: dailyExplain.dailyLoadExplain,
    preContextVisible: !!preContextText,
    preContextText: preContextText ?? "",
    injuryContextVisible: !!injuryContextText,
    injuryContextText: injuryContextText ?? "",
  };
}
