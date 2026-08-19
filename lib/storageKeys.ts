// 全局 localStorage 键名清单：禁止在业务文件中散落魔法字符串。
// 新增 key 必须同步更新本文件与《开发原则》§2 对照表。

export const STORAGE_KEYS = {
  players: "softball_players",
  currentUser: "softball_currentUser",
  /** @deprecated 旧版当场打点；读取时迁移进 sessionDraft 后清除 */
  hitsLegacy: "softball_hits",
  sessionDraft: "softball_session_draft",
  gamesHistory: "softball_games_history",
  readinessHistory: "softball_readiness_history",
  /** @deprecated 旧 VAS 伤病快照；损伤改为 episode 草稿 */
  injuryLog: "softball_injury_log",
  injuryCases: "softball_injury_cases",
  /** 训后 session RPE 本地草稿（云端权威） */
  sessionFeedback: "softball_session_feedback",
  /** 女性队员上次经期开始日：playerId → YYYY-MM-DD */
  periodStartByPlayer: "softball_period_start",
} as const;

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];
