"use server";

import { prisma } from "@/lib/db";
import type { ActionResult } from "@/lib/actionResult";
import { errorMessage } from "@/lib/actionResult";
import { writeAuditLog } from "@/lib/auth/audit";
import { canManageAccounts } from "@/lib/auth/policy";
import { requireSessionAction } from "@/lib/auth/requireSession";
import { notOnThisTeam } from "@/lib/auth/teamScope";
import type { Gender } from "@/lib/players";

export type PendingClaimRow = {
  claimId: string;
  accountId: string;
  username: string;
  displayName: string;
  createdAt: string;
};

export async function listPendingClaims(): Promise<
  ActionResult<{ claims: PendingClaimRow[] }>
> {
  try {
    const session = await requireSessionAction();
    if (!session.success) return session;
    if (!canManageAccounts(session.ctx)) {
      return { success: false, error: "仅管理员可查看认领队列" };
    }

    const rows = await prisma.membershipClaim.findMany({
      where: {
        status: "pending",
        account: { teamId: session.ctx.teamId },
      },
      include: { account: { select: { username: true } } },
      orderBy: { createdAt: "asc" },
    });

    return {
      success: true,
      claims: rows.map((r) => ({
        claimId: r.id,
        accountId: r.accountId,
        username: r.account.username,
        displayName: r.displayName,
        createdAt: r.createdAt.toISOString(),
      })),
    };
  } catch (error) {
    console.error("认领列表失败:", error);
    return { success: false, error: errorMessage(error) };
  }
}

export type ApproveClaimPayload = {
  claimId: string;
  /** 绑定既有 Player；为空则新建 */
  playerId?: string;
  /** 新建队员时必填 */
  newPlayerName?: string;
  newPlayerGender?: Gender;
};

/**
 * 推导步骤：admin 审批 → 同队校验 → 1 Player 1 Account → 写 playerId + approved
 * 若绑定旧 Player 且 role=coach，回填 AccountRole.coach
 */
export async function approveMembershipClaim(
  payload: ApproveClaimPayload
): Promise<ActionResult> {
  try {
    const session = await requireSessionAction();
    if (!session.success) return session;
    if (!canManageAccounts(session.ctx)) {
      return { success: false, error: "仅管理员可批准认领" };
    }

    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT id FROM "MembershipClaim" WHERE id = ${payload.claimId} FOR UPDATE
      `;
      const claim = await tx.membershipClaim.findUnique({
        where: { id: payload.claimId },
        include: { account: true },
      });
      if (!claim || claim.status !== "pending") {
        throw new Error("认领记录无效或已处理");
      }
      if (claim.account.teamId !== session.ctx.teamId) {
        throw new Error("目标不在本队");
      }

      let playerId = payload.playerId?.trim();
      if (playerId) {
        await tx.$queryRaw`
          SELECT id FROM "Player" WHERE id = ${playerId} FOR UPDATE
        `;
        const player = await tx.player.findUnique({
          where: { id: playerId },
        });
        if (!player || player.teamId !== session.ctx.teamId) {
          throw new Error("队员不存在或不在本队");
        }
        const bound = await tx.account.findFirst({
          where: { playerId, id: { not: claim.accountId } },
        });
        if (bound) throw new Error("该队员已绑定其他账号");
      } else {
        const name = payload.newPlayerName?.trim();
        if (!name) throw new Error("请指定绑定队员或新建姓名");
        const created = await tx.player.create({
          data: {
            teamId: session.ctx.teamId,
            name,
            gender: payload.newPlayerGender ?? null,
            role: "player",
          },
        });
        playerId = created.id;
      }

      const legacyPlayer = await tx.player.findUnique({
        where: { id: playerId },
        select: { role: true },
      });

      const moved = await tx.membershipClaim.updateMany({
        where: { id: claim.id, status: "pending" },
        data: {
          status: "approved",
          playerId,
          reviewedByAccountId: session.ctx.accountId,
          reviewedAt: new Date(),
        },
      });
      if (moved.count !== 1) {
        throw new Error("认领记录无效或已处理");
      }

      await tx.account.update({
        where: { id: claim.accountId },
        data: { playerId },
      });

      if (legacyPlayer?.role === "coach") {
        const hasCoach = await tx.accountRole.findFirst({
          where: { accountId: claim.accountId, role: "coach" },
        });
        if (!hasCoach) {
          await tx.accountRole.create({
            data: {
              accountId: claim.accountId,
              role: "coach",
              grantedByAccountId: session.ctx.accountId,
            },
          });
        }
      }
    });

    await writeAuditLog({
      action: "claim_approved",
      actorAccountId: session.ctx.accountId,
      targetId: payload.claimId,
    });

    return { success: true };
  } catch (error) {
    console.error("批准认领失败:", error);
    return { success: false, error: errorMessage(error) };
  }
}

export async function rejectMembershipClaim(
  claimId: string
): Promise<ActionResult> {
  try {
    const session = await requireSessionAction();
    if (!session.success) return session;
    if (!canManageAccounts(session.ctx)) {
      return { success: false, error: "仅管理员可拒绝认领" };
    }

    const updated = await prisma.membershipClaim.updateMany({
      where: {
        id: claimId,
        status: "pending",
        account: { teamId: session.ctx.teamId },
      },
      data: {
        status: "rejected",
        reviewedByAccountId: session.ctx.accountId,
        reviewedAt: new Date(),
      },
    });
    if (updated.count !== 1) return notOnThisTeam();

    await writeAuditLog({
      action: "claim_rejected",
      actorAccountId: session.ctx.accountId,
      targetId: claimId,
    });

    return { success: true };
  } catch (error) {
    console.error("拒绝认领失败:", error);
    return { success: false, error: errorMessage(error) };
  }
}
