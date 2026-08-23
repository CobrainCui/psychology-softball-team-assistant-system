// 经期开始日以云端 CycleEvent 为准；不再写入 softball_period_start。
// 读取忽略旧缓存，避免跨账号把本地日期当成权威。

export function getPeriodStartDate(playerId: string): string {
  void playerId;
  return "";
}

export function setPeriodStartDate(playerId: string, date: string): void {
  void playerId;
  void date;
}
