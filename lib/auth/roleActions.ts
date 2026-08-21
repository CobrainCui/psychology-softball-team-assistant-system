"use server";

import { prisma } from "@/lib/db";
import type { ActionResult } from "@/lib/actionResult";
import { errorMessage } from "@/lib/actionResult";
import { writeAuditLog } from "@/lib/auth/audit";
import { canManageAccounts } from "@/lib/auth/policy";
import { checkRateLimit } from "@/lib/auth/rateLimit";
import { requireSessionAction } from "@/lib/auth/requireSession";
import { loadSameTeamAccount, notOnThisTeam } from "@/lib/auth/teamScope";
import type { RoleKind } from "@/lib/auth/types";

const ELEVATED_ROLES: RoleKind[] = ["captain", "coach", "admin"];

export async function grantRole(
  targetAccountId: string,
  role: RoleKind
): Promise<ActionResult> {
  try {
    const session = await requireSessionAction();
    if (!session.success) return session;
    if (!canManageAccounts(session.ctx)) {
      return { success: false, error: "仅管理员可授予角色" };
    }

    const rate = await checkRateLimit(
      `role_grant:${session.ctx.accountId}`,
      "role_grant"
    );
    if (!rate.allowed) return { success: false, error: rate.error };

    const target = await loadSameTeamAccount(
      targetAccountId,
      session.ctx.teamId
    );
    if (!target) return notOnThisTeam();
    const claim = await prisma.membershipClaim.findUnique({
      where: { accountId: targetAccountId },
      select: { status: true },
    });
    // 推导步骤：高权必须 approved + playerId，禁止 pending 被授 captain/coach/admin
    if (
      ELEVATED_ROLES.includes(role) &&
      (claim?.status !== "approved" || !target.playerId)
    ) {
      return { success: false, error: "仅已认领账号可授予队长、教练或管理员" };
    }

    if (role === "admin") {
      const already = await prisma.accountRole.findFirst({
        where: { accountId: targetAccountId, role: "admin" },
      });
      if (already) return { success: true };
    }

    await prisma.accountRole.upsert({
      where: {
        accountId_role: { accountId: targetAccountId, role },
      },
      create: {
        accountId: targetAccountId,
        role,
        grantedByAccountId: session.ctx.accountId,
      },
      update: {},
    });

    await writeAuditLog({
      action: "role_granted",
      actorAccountId: session.ctx.accountId,
      targetAccountId,
      metadata: { role },
    });

    return { success: true };
  } catch (error) {
    console.error("授予角色失败:", error);
    return { success: false, error: errorMessage(error) };
  }
}

export async function revokeRole(
  targetAccountId: string,
  role: RoleKind
): Promise<ActionResult> {
  try {
    const session = await requireSessionAction();
    if (!session.success) return session;
    if (!canManageAccounts(session.ctx)) {
      return { success: false, error: "仅管理员可撤销角色" };
    }

    const target = await loadSameTeamAccount(
      targetAccountId,
      session.ctx.teamId
    );
    if (!target) return notOnThisTeam();

    if (role === "admin") {
      const adminCount = await prisma.accountRole.count({
        where: { role: "admin", account: { teamId: session.ctx.teamId } },
      });
      const targetIsAdmin = await prisma.accountRole.findFirst({
        where: { accountId: targetAccountId, role: "admin" },
      });
      if (targetIsAdmin && adminCount <= 1) {
        return { success: false, error: "不能移除最后一名管理员" };
      }
    }

    await prisma.accountRole.deleteMany({
      where: { accountId: targetAccountId, role },
    });

    await writeAuditLog({
      action: "role_revoked",
      actorAccountId: session.ctx.accountId,
      targetAccountId,
      metadata: { role },
    });

    return { success: true };
  } catch (error) {
    console.error("撤销角色失败:", error);
    return { success: false, error: errorMessage(error) };
  }
}

export async function requestRoleChange(
  requestedRole: "captain" | "coach"
): Promise<ActionResult> {
  try {
    const session = await requireSessionAction();
    if (!session.success) return session;
    if (!session.ctx.isApproved) {
      return { success: false, error: "请先完成名册认领" };
    }
    if (session.ctx.roles.includes(requestedRole)) {
      return { success: false, error: "已拥有该角色" };
    }

    const pending = await prisma.roleChangeRequest.findFirst({
      where: {
        accountId: session.ctx.accountId,
        requestedRole,
        status: "pending",
      },
    });
    if (pending) {
      return { success: false, error: "已有待审批申请" };
    }

    await prisma.roleChangeRequest.create({
      data: {
        accountId: session.ctx.accountId,
        requestedRole,
      },
    });

    await writeAuditLog({
      action: "role_change_requested",
      actorAccountId: session.ctx.accountId,
      metadata: { requestedRole },
    });

    return { success: true };
  } catch (error) {
    console.error("角色申请失败:", error);
    return { success: false, error: errorMessage(error) };
  }
}

export async function approveRoleChangeRequest(
  requestId: string
): Promise<ActionResult> {
  try {
    const session = await requireSessionAction();
    if (!session.success) return session;
    if (!canManageAccounts(session.ctx)) {
      return { success: false, error: "仅管理员可审批角色申请" };
    }

    const req = await prisma.roleChangeRequest.findUnique({
      where: { id: requestId },
      include: { account: { select: { teamId: true, playerId: true } } },
    });
    if (!req || req.status !== "pending") {
      return { success: false, error: "申请无效或已处理" };
    }
    if (req.account.teamId !== session.ctx.teamId) return notOnThisTeam();
    if (!req.account.playerId) {
      return { success: false, error: "仅已认领账号可授予队长、教练或管理员" };
    }
    if (!ELEVATED_ROLES.includes(req.requestedRole as RoleKind)) {
      return { success: false, error: "无效角色" };
    }

    await prisma.$transaction(async (tx) => {
      await tx.roleChangeRequest.update({
        where: { id: requestId },
        data: {
          status: "approved",
          reviewedByAccountId: session.ctx.accountId,
          reviewedAt: new Date(),
        },
      });
      await tx.accountRole.upsert({
        where: {
          accountId_role: {
            accountId: req.accountId,
            role: req.requestedRole,
          },
        },
        create: {
          accountId: req.accountId,
          role: req.requestedRole,
          grantedByAccountId: session.ctx.accountId,
        },
        update: {},
      });
    });

    await writeAuditLog({
      action: "role_change_approved",
      actorAccountId: session.ctx.accountId,
      targetAccountId: req.accountId,
      metadata: { role: req.requestedRole },
    });

    return { success: true };
  } catch (error) {
    console.error("审批角色申请失败:", error);
    return { success: false, error: errorMessage(error) };
  }
}

export async function listRoleChangeRequests(): Promise<
  ActionResult<{
    requests: {
      id: string;
      accountId: string;
      username: string;
      requestedRole: string;
      createdAt: string;
    }[];
  }>
> {
  try {
    const session = await requireSessionAction();
    if (!session.success) return session;
    if (!canManageAccounts(session.ctx)) {
      return { success: false, error: "仅管理员可查看角色申请" };
    }

    const rows = await prisma.roleChangeRequest.findMany({
      where: {
        status: "pending",
        account: { teamId: session.ctx.teamId },
      },
      include: { account: { select: { username: true } } },
      orderBy: { createdAt: "asc" },
    });

    return {
      success: true,
      requests: rows.map((r) => ({
        id: r.id,
        accountId: r.accountId,
        username: r.account.username,
        requestedRole: r.requestedRole,
        createdAt: r.createdAt.toISOString(),
      })),
    };
  } catch (error) {
    return { success: false, error: errorMessage(error) };
  }
}
