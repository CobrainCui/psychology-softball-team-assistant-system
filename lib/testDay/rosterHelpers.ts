import type { Player } from "@/lib/players";
import type { Assignments } from "@/lib/sessionDraft";

export function playersAssignedTo(
  testItem: string,
  players: Player[],
  assignments: Assignments
): Player[] {
  return players.filter((player) =>
    assignments[player.id]?.includes(testItem)
  );
}
