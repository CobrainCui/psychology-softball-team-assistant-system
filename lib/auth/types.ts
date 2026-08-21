/** 与 Prisma AccountRoleKind 对齐 */
export type RoleKind = "player" | "captain" | "coach" | "admin";

export type ActiveView = "player" | "captain" | "coach";

export type MembershipClaimStatus = "pending" | "approved" | "rejected";

import type { Gender } from "@/lib/players";

/** 服务端鉴权上下文：角色按并集计算权限，activeView 不参与鉴权 */
export type AuthContext = {
  accountId: string;
  username: string;
  teamId: string;
  playerId: string | null;
  playerName: string | null;
  gender: Gender | null;
  roles: RoleKind[];
  activeView: ActiveView;
  claimStatus: MembershipClaimStatus | null;
  isApproved: boolean;
};

export type SessionUser = {
  accountId: string;
  username: string;
  teamId: string;
  playerId: string | null;
  playerName: string | null;
  gender: Gender | null;
  roles: RoleKind[];
  activeView: ActiveView;
  claimStatus: MembershipClaimStatus | null;
};
