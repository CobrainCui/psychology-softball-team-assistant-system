import type { TestDayEntryKind } from "@/lib/testDay/collab/types";

export function hitEntityKey(clientEntryId: string): string {
  return `hit:${clientEntryId}`;
}

export function flyEntityKey(clientEntryId: string): string {
  return `fly:${clientEntryId}`;
}

export function speedEntityKey(playerId: string, columnId: string): string {
  return `speed:${playerId}:${columnId}`;
}

export function strikeEntityKey(columnId: string, judgeId: string): string {
  return `strike:${columnId}:${judgeId}`;
}

export function throwEntityKey(
  testItem: string,
  throwerId: string,
  firstBaseId: string
): string {
  return `throw:${testItem}:${throwerId}:${firstBaseId}`;
}

export function customNoteEntityKey(testItem: string, scope: string): string {
  return `cnote:${testItem}:${scope}`;
}

export function entityKeyForKind(
  kind: TestDayEntryKind,
  input: {
    clientEntryId: string;
    playerId?: string;
    columnId?: string;
    judgeId?: string;
    testItem?: string;
    throwerId?: string;
    firstBaseId?: string;
    noteScope?: string;
  }
): string | null {
  switch (kind) {
    case "hit":
      return hitEntityKey(input.clientEntryId);
    case "fly_catch":
      return flyEntityKey(input.clientEntryId);
    case "speed_mark":
      if (!input.playerId || !input.columnId) return null;
      return speedEntityKey(input.playerId, input.columnId);
    case "strike_cell":
      if (!input.columnId || !input.judgeId) return null;
      return strikeEntityKey(input.columnId, input.judgeId);
    case "throw_play":
      if (!input.testItem || !input.throwerId || !input.firstBaseId) return null;
      return throwEntityKey(input.testItem, input.throwerId, input.firstBaseId);
    case "custom_player_note":
      if (!input.testItem || !input.playerId) return null;
      return customNoteEntityKey(input.testItem, input.playerId);
    case "custom_group_note":
      if (!input.testItem || !input.noteScope) return null;
      return customNoteEntityKey(input.testItem, `group:${input.noteScope}`);
    case "custom_single_note":
      if (!input.testItem) return null;
      return customNoteEntityKey(input.testItem, "single");
    default:
      return null;
  }
}
