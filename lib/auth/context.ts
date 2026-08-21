import type { Gender } from "@/lib/players";
import type { AccountRoleKind, ActiveView as PrismaActiveView } from "@/lib/generated/prisma/client";
import type {
  ActiveView,
  AuthContext,
  MembershipClaimStatus,
  RoleKind,
  SessionUser,
} from "@/lib/auth/types";

export function toRoleKind(role: AccountRoleKind): RoleKind {
  return role as RoleKind;
}

export function toActiveView(view: PrismaActiveView): ActiveView {
  return view as ActiveView;
}

type AccountWithRelations = {
  id: string;
  username: string;
  teamId: string;
  playerId: string | null;
  activeView: PrismaActiveView;
  status: string;
  roles: { role: AccountRoleKind }[];
  membershipClaim: {
    status: string;
    displayName: string;
  } | null;
  player: { name: string; gender: Gender | null } | null;
};

export function buildAuthContext(account: AccountWithRelations): AuthContext {
  const claimStatus = (account.membershipClaim?.status ??
    null) as MembershipClaimStatus | null;
  const isApproved = claimStatus === "approved" && Boolean(account.playerId);

  return {
    accountId: account.id,
    username: account.username,
    teamId: account.teamId,
    playerId: account.playerId,
    playerName:
      account.player?.name ?? account.membershipClaim?.displayName ?? null,
    gender: account.player?.gender ?? null,
    roles: account.roles.map((r) => toRoleKind(r.role)),
    activeView: toActiveView(account.activeView),
    claimStatus,
    isApproved,
  };
}

export function toSessionUser(ctx: AuthContext): SessionUser {
  return {
    accountId: ctx.accountId,
    username: ctx.username,
    teamId: ctx.teamId,
    playerId: ctx.playerId,
    playerName: ctx.playerName,
    gender: ctx.gender,
    roles: ctx.roles,
    activeView: ctx.activeView,
    claimStatus: ctx.claimStatus,
  };
}

export const accountAuthInclude = {
  roles: true,
  membershipClaim: true,
  player: { select: { name: true, gender: true } },
} as const;
