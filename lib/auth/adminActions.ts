"use server";

import { prisma } from "@/lib/db";
import type { ActionResult } from "@/lib/actionResult";
import { errorMessage } from "@/lib/actionResult";
import { writeAuditLog } from "@/lib/auth/audit";
import { canManageAccounts } from "@/lib/auth/policy";
import { requireSessionAction } from "@/lib/auth/requireSession";
import { loadSameTeamAccount, notOnThisTeam } from "@/lib/auth/teamScope";
import { revokeAllSessions } from "@/lib/auth/session";
import type { RoleKind } from "@/lib/auth/types";

export type AdminAccountRow = {
  accountId: string;
  username: string;
  status: string;
  roles: RoleKind[];
  playerName: string | null;
  claimStatus: string | null;
};

export async function listAccountsForAdmin(): Promise<
  ActionResult<{ accounts: AdminAccountRow[] }>
> {
  try {
    const session = await requireSessionAction();
    if (!session.success) return session;
    if (!canManageAccounts(session.ctx)) {
      return { success: false, error: "仅管理员可查看账户列表" };
    }

    const rows = await prisma.account.findMany({
      where: { teamId: session.ctx.teamId },
      include: {
        roles: true,
        membershipClaim: true,
        player: { select: { name: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    return {
      success: true,
      accounts: rows.map((a) => ({
        accountId: a.id,
        username: a.username,
        status: a.status,
        roles: a.roles.map((r) => r.role as RoleKind),
        playerName: a.player?.name ?? null,
        claimStatus: a.membershipClaim?.status ?? null,
      })),
    };
  } catch (error) {
    return { success: false, error: errorMessage(error) };
  }
}

export async function disableAccount(
  targetAccountId: string
): Promise<ActionResult> {
  try {
    const session = await requireSessionAction();
    if (!session.success) return session;
    if (!canManageAccounts(session.ctx)) {
      return { success: false, error: "仅管理员可停用账户" };
    }

    const target = await loadSameTeamAccount(
      targetAccountId,
      session.ctx.teamId
    );
    if (!target) return notOnThisTeam();

    const targetIsAdmin = await prisma.accountRole.findFirst({
      where: { accountId: targetAccountId, role: "admin" },
    });
    if (targetIsAdmin) {
      const adminCount = await prisma.accountRole.count({
        where: { role: "admin", account: { teamId: session.ctx.teamId } },
      });
      if (adminCount <= 1) {
        return { success: false, error: "不能停用最后一名管理员" };
      }
    }

    await prisma.account.update({
      where: { id: targetAccountId },
      data: { status: "disabled" },
    });
    await revokeAllSessions(targetAccountId);

    await writeAuditLog({
      action: "account_disabled",
      actorAccountId: session.ctx.accountId,
      targetAccountId,
    });

    return { success: true };
  } catch (error) {
    console.error("停用账户失败:", error);
    return { success: false, error: errorMessage(error) };
  }
}

export async function enableAccount(
  targetAccountId: string
): Promise<ActionResult> {
  try {
    const session = await requireSessionAction();
    if (!session.success) return session;
    if (!canManageAccounts(session.ctx)) {
      return { success: false, error: "仅管理员可启用账户" };
    }

    const target = await loadSameTeamAccount(
      targetAccountId,
      session.ctx.teamId
    );
    if (!target) return notOnThisTeam();

    await prisma.account.update({
      where: { id: targetAccountId },
      data: { status: "active" },
    });

    await writeAuditLog({
      action: "account_enabled",
      actorAccountId: session.ctx.accountId,
      targetAccountId,
    });

    return { success: true };
  } catch (error) {
    return { success: false, error: errorMessage(error) };
  }
}

export async function listEnrollmentCodes(): Promise<
  ActionResult<{
    codes: {
      id: string;
      status: string;
      expiresAt: string | null;
      usedAt: string | null;
      revokedAt: string | null;
      revokedNote: string | null;
    }[];
  }>
> {
  try {
    const session = await requireSessionAction();
    if (!session.success) return session;
    if (!canManageAccounts(session.ctx)) {
      return { success: false, error: "仅管理员可查看入队码" };
    }

    const rows = await prisma.enrollmentCode.findMany({
      where: { teamId: session.ctx.teamId },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    return {
      success: true,
      codes: rows.map((c) => ({
        id: c.id,
        status: c.status,
        expiresAt: c.expiresAt?.toISOString() ?? null,
        usedAt: c.usedAt?.toISOString() ?? null,
        revokedAt: c.revokedAt?.toISOString() ?? null,
        revokedNote: c.revokedNote,
      })),
    };
  } catch (error) {
    return { success: false, error: errorMessage(error) };
  }
}
