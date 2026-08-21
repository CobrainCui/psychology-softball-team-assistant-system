export type SeasonStatus = "planned" | "active" | "archived";
export type ScheduleEventKind = "game" | "scrimmage";
export type ScheduleEventStatus = "planned" | "cancelled" | "completed";
export type GameResultKind = "win" | "loss" | "tie" | "unknown";
export type GameSummarySource = "manual" | "iscore_pdf";
export type GameSummaryStatus = "draft" | "confirmed";

export type SeasonDto = {
  id: string;
  teamId: string;
  name: string;
  startsOn: string;
  endsOn: string;
  effectiveEndsOn: string;
  status: SeasonStatus;
};

export type ScheduleEventDto = {
  id: string;
  teamId: string;
  seasonId: string | null;
  kind: ScheduleEventKind;
  status: ScheduleEventStatus;
  startAt: string;
  endAt: string;
  opponent: string | null;
  venue: string | null;
  title: string | null;
  note: string | null;
  statusNote: string | null;
};

export type MatchWindowDto = {
  eventId: string;
  title: string;
  opponent: string | null;
  startAt: string;
  endAt: string;
  displayStart: string;
  displayEnd: string;
};

export type GameFileDto = {
  id: string;
  originalName: string;
  sizeBytes: number;
  uploadedAt: string;
  uploadedById: string;
  retainEvidence: boolean;
};

export type GameSummaryDto = {
  id: string;
  status: GameSummaryStatus;
  ourScore: number | null;
  opponentScore: number | null;
  result: GameResultKind;
  source: GameSummarySource;
  sourceFileId: string | null;
  version: number;
  note: string | null;
  confirmedAt: string | null;
  lines: { playerId: string; participated: boolean }[];
};

export const ATTRIBUTION_FOOTER =
  "测试日按归档日归入赛季，须当天归档；比赛按事件开始日（队时区）归属。年报为自然年。";

export type IScoreParsed = {
  date: string;
  opponent: string | null;
  ourScore: number | null;
  opponentScore: number | null;
  result: GameResultKind;
  players: { name: string; participated: boolean }[];
};
