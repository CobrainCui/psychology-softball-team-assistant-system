"use server";

import { prisma } from "@/lib/db";
import type { ActionResult } from "@/lib/actionResult";
import { errorMessage } from "@/lib/actionResult";
import { writeAuditLog } from "@/lib/auth/audit";
import { RESET_TOKEN_TTL_HOURS } from "@/lib/auth/constants";
import { hashPassword } from "@/lib/auth/password";
import { canManageAccounts } from "@/lib/auth/policy";
import { checkRateLimit } from "@/lib/auth/rateLimit";
import { requireSessionAction } from "@/lib/auth/requireSession";
import { loadSameTeamAccount, notOnThisTeam } from "@/lib/auth/teamScope";
import { resolvePublicAppOrigin } from "@/lib/auth/publicOrigin";
import { revokeAllSessions } from "@/lib/auth/session";
import { generateToken, hashToken } from "@/lib/auth/tokens";

export async function createPasswordResetLink(
  targetAccountId: string
): Promise<ActionResult<{ url: string; token: string }>> {
  try {
    const session = await requireSessionAction();
    if (!session.success) return session;
    if (!canManageAccounts(session.ctx)) {
      return { success: false, error: "仅管理员可生成重置链接" };
    }

    const rate = await checkRateLimit(
      `reset:${session.ctx.accountId}`,
      "reset"
    );
    if (!rate.allowed) return { success: false, error: rate.error };

    const account = await loadSameTeamAccount(
      targetAccountId,
      session.ctx.teamId
    );
    if (!account) return notOnThisTeam();

    const plain = generateToken(32);
    const tokenHash = hashToken(plain);
    const expiresAt = new Date(
      Date.now() + RESET_TOKEN_TTL_HOURS * 60 * 60 * 1000
    );

    // 推导步骤：先作废同账户未使用令牌 → 再写入最新一条，保证仅最新链接有效
    await prisma.$transaction(async (tx) => {
      await tx.passwordResetToken.updateMany({
        where: { accountId: targetAccountId, usedAt: null },
        data: { usedAt: new Date() },
      });
      await tx.passwordResetToken.create({
        data: { accountId: targetAccountId, tokenHash, expiresAt },
      });
    });

    await writeAuditLog({
      action: "reset_link_created",
      actorAccountId: session.ctx.accountId,
      targetAccountId,
    });

    const originRes = resolvePublicAppOrigin();
    if (!originRes.ok) {
      return { success: false, error: originRes.error };
    }

    return {
      success: true,
      token: plain,
      url: `${originRes.origin}/reset/${plain}`,
    };
  } catch (error) {
    console.error("生成重置链接失败:", error);
    return { success: false, error: errorMessage(error) };
  }
}

export async function consumePasswordResetToken(
  token: string,
  newPassword: string
): Promise<ActionResult> {
  try {
    if (newPassword.length < 8) {
      return { success: false, error: "密码至少 8 位" };
    }

    const tokenHash = hashToken(token);
    const now = new Date();
    const passwordHash = await hashPassword(newPassword);

    // 推导步骤：updateMany 把 usedAt IS NULL 且未过期作为原子条件，并发第二请求 count=0
    let accountId: string;
    try {
      accountId = await prisma.$transaction(async (tx) => {
        const consumed = await tx.passwordResetToken.updateMany({
          where: {
            tokenHash,
            usedAt: null,
            expiresAt: { gt: now },
          },
          data: { usedAt: now },
        });
        if (consumed.count !== 1) {
          throw new Error("RESET_TOKEN_INVALID");
        }
        const row = await tx.passwordResetToken.findUnique({
          where: { tokenHash },
        });
        if (!row) throw new Error("RESET_TOKEN_INVALID");
        await tx.account.update({
          where: { id: row.accountId },
          data: { passwordHash },
        });
        return row.accountId;
      });
    } catch (error) {
      if (error instanceof Error && error.message === "RESET_TOKEN_INVALID") {
        return { success: false, error: "重置链接无效或已过期" };
      }
      throw error;
    }

    await revokeAllSessions(accountId);

    await writeAuditLog({
      action: "password_reset_consumed",
      targetAccountId: accountId,
    });

    return { success: true };
  } catch (error) {
    console.error("重置密码失败:", error);
    return { success: false, error: errorMessage(error) };
  }
}

export async function adminForceResetPassword(
  targetAccountId: string,
  newPassword: string
): Promise<ActionResult> {
  try {
    const session = await requireSessionAction();
    if (!session.success) return session;
    if (!canManageAccounts(session.ctx)) {
      return { success: false, error: "仅管理员可强制重置密码" };
    }
    if (newPassword.length < 8) {
      return { success: false, error: "密码至少 8 位" };
    }

    const target = await loadSameTeamAccount(
      targetAccountId,
      session.ctx.teamId
    );
    if (!target) return notOnThisTeam();

    const passwordHash = await hashPassword(newPassword);
    await prisma.account.update({
      where: { id: targetAccountId },
      data: { passwordHash },
    });
    await revokeAllSessions(targetAccountId);

    await writeAuditLog({
      action: "password_force_reset",
      actorAccountId: session.ctx.accountId,
      targetAccountId,
    });

    return { success: true };
  } catch (error) {
    console.error("强制重置失败:", error);
    return { success: false, error: errorMessage(error) };
  }
}
