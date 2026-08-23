export interface PendingHit {
  x: number;
  y: number;
}

export type SidebarMode = "byPlayer" | "byTest";

export type NewRosterPlayerInput = {
  name: string;
  gender: "male" | "female";
};
