// 全局 localStorage 键名清单：禁止在业务文件中散落魔法字符串。
// 新增 key 必须同步更新本文件与《开发原则》§2 对照表。
// 业务草稿实际读写为 `${base}:${teamId}:${accountId}`；测试日当场草稿另加 `:live`
//（见 lib/scopedStorage.ts）。`:live` 不是云端协作 draftId。

export const STORAGE_KEYS = {
  players: "softball_players",
  currentUser: "softball_currentUser",
  /** @deprecated 旧版当场打点；无后缀 key 启动时删除，不再迁入分区草稿 */
  hitsLegacy: "softball_hits",
  sessionDraft: "softball_session_draft",
  gamesHistory: "softball_games_history",
  readinessHistory: "softball_readiness_history",
  /** @deprecated 旧 VAS 伤病快照；损伤改为 episode 草稿 */
  injuryLog: "softball_injury_log",
  injuryCases: "softball_injury_cases",
  /** 训后反馈本地草稿（云端权威） */
  sessionFeedback: "softball_session_feedback",
  /** 女性队员上次经期开始日：已停止写入；云端 CycleEvent 为权威 */
  periodStartByPlayer: "softball_period_start",
  /** 当前浏览器会话对应的 teamId:accountId（非 cookie，供跨标签发现身份变更） */
  authOwner: "softball_auth_owner",
} as const;

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];
