"use server";

import { prisma } from "@/lib/db";
import { getOrCreateDefaultTeam } from "@/lib/team";
import type { ActionResult } from "@/lib/actionResult";
import { errorMessage } from "@/lib/actionResult";
import { writeAuditLog } from "@/lib/auth/audit";
import {
  ENROLLMENT_CODE_TTL_DAYS,
  USERNAME_RE,
} from "@/lib/auth/constants";
import {
  hashPassword,
  needsPasswordRehash,
} from "@/lib/auth/password";
import { checkRateLimit } from "@/lib/auth/rateLimit";
import { readClientIp } from "@/lib/auth/request";
import {
  createSession,
  setSessionCookie,
} from "@/lib/auth/session";
import {
  generateEnrollmentCodePlain,
  hashToken,
  normalizeEnrollmentCodeInput,
  safeEqualToken,
} from "@/lib/auth/tokens";
import { requireSessionAction } from "@/lib/auth/requireSession";
import { canManageAccounts } from "@/lib/auth/policy";

export type RegisterPayload = {
  code: string;
  username: string;
  password: string;
  displayName: string;
};

/**
 * 推导步骤：单事务内 锁码→校验码→校验用户名→占码→建 Account+pending Claim+player 角色
 * 任一步失败整事务回滚，不得消耗码
 */
export async function registerWithEnrollmentCode(
  payload: RegisterPayload
): Promise<ActionResult<{ accountId: string }>> {
  try {
    const ip = await readClientIp();
    const rate = await checkRateLimit(`enroll:${ip}`, "enroll");
    if (!rate.allowed) return { success: false, error: rate.error };

    const username = payload.username.trim().toLowerCase();
    const displayName = payload.displayName.trim();
    const password = payload.password;
    const normalizedCode = normalizeEnrollmentCodeInput(payload.code);

    if (!USERNAME_RE.test(username)) {
      return {
        success: false,
        error: "用户名须为 3–32 位字母、数字或下划线",
      };
    }
    if (password.length < 8) {
      return { success: false, error: "密码至少 8 位" };
    }
    if (!displayName) {
      return { success: false, error: "显示姓名不能为空" };
    }
    if (normalizedCode.length < 12) {
      return { success: false, error: "入队码无效" };
    }

    const team = await getOrCreateDefaultTeam();
    const passwordHash = await hashPassword(password);

    const accountId = await prisma.$transaction(async (tx) => {
      const codes = await tx.enrollmentCode.findMany({
        where: {
          teamId: team.id,
          status: "active",
        },
      });

      let matched: (typeof codes)[number] | null = null;
      for (const row of codes) {
        if (safeEqualToken(normalizedCode, row.codeHash)) {
          matched = row;
          break;
        }
      }
      if (!matched) {
        throw new Error("入队码无效或已失效");
      }
      if (matched.expiresAt && matched.expiresAt <= new Date()) {
        throw new Error("入队码已过期");
      }

      const locked = await tx.$queryRaw<
        { id: string; status: string }[]
      >`SELECT id, status FROM "EnrollmentCode" WHERE id = ${matched.id} FOR UPDATE`;

      const row = locked[0];
      if (!row || row.status !== "active") {
        throw new Error("入队码无效或已失效");
      }

      const existingUser = await tx.account.findUnique({
        where: { username },
      });
      if (existingUser) {
        throw new Error("用户名已被占用");
      }

      const account = await tx.account.create({
        data: {
          teamId: team.id,
          username,
          passwordHash,
          activeView: "player",
        },
      });

      await tx.membershipClaim.create({
        data: {
          accountId: account.id,
          status: "pending",
          displayName,
        },
      });

      await tx.accountRole.create({
        data: { accountId: account.id, role: "player" },
      });

      await tx.enrollmentCode.update({
        where: { id: matched.id },
        data: {
          status: "used",
          usedAt: new Date(),
          usedByAccountId: account.id,
        },
      });

      return account.id;
    });

    await writeAuditLog({
      action: "enroll_redeemed",
      targetAccountId: accountId,
      ip,
      metadata: { username },
    });

    const sessionToken = await createSession(accountId);
    await setSessionCookie(sessionToken);

    return { success: true, accountId };
  } catch (error) {
    console.error("注册失败:", error);
    return { success: false, error: errorMessage(error) };
  }
}

export async function generateEnrollmentCodes(
  count: number
): Promise<ActionResult<{ codes: string[] }>> {
  try {
    const session = await requireSessionAction();
    if (!session.success) return session;
    if (!canManageAccounts(session.ctx)) {
      return { success: false, error: "仅管理员可生成入队码" };
    }

    const ip = await readClientIp();
    const rate = await checkRateLimit(
      `role_grant:${session.ctx.accountId}`,
      "role_grant"
    );
    if (!rate.allowed) return { success: false, error: rate.error };

    const n = Math.min(Math.max(1, Math.floor(count)), 50);
    const teamId = session.ctx.teamId;
    const expiresAt = new Date(
      Date.now() + ENROLLMENT_CODE_TTL_DAYS * 24 * 60 * 60 * 1000
    );
    const plainCodes: string[] = [];

    await prisma.$transaction(async (tx) => {
      for (let i = 0; i < n; i++) {
        const plain = generateEnrollmentCodePlain();
        plainCodes.push(plain);
        const normalized = normalizeEnrollmentCodeInput(plain);
        await tx.enrollmentCode.create({
          data: {
            teamId,
            codeHash: hashToken(normalized),
            expiresAt,
            createdByAccountId: session.ctx.accountId,
          },
        });
      }
    });

    await writeAuditLog({
      action: "enrollment_codes_created",
      actorAccountId: session.ctx.accountId,
      ip,
      metadata: { count: n },
    });

    return { success: true, codes: plainCodes };
  } catch (error) {
    console.error("生成入队码失败:", error);
    return { success: false, error: errorMessage(error) };
  }
}

export async function revokeEnrollmentCode(
  codeId: string,
  note?: string
): Promise<ActionResult> {
  try {
    const session = await requireSessionAction();
    if (!session.success) return session;
    if (!canManageAccounts(session.ctx)) {
      return { success: false, error: "仅管理员可作废入队码" };
    }

    await prisma.enrollmentCode.updateMany({
      where: { id: codeId, status: "active", teamId: session.ctx.teamId },
      data: {
        status: "revoked",
        revokedAt: new Date(),
        revokedNote: note?.trim() || null,
      },
    });

    await writeAuditLog({
      action: "enrollment_code_revoked",
      actorAccountId: session.ctx.accountId,
      targetId: codeId,
      metadata: { note },
    });

    return { success: true };
  } catch (error) {
    console.error("作废入队码失败:", error);
    return { success: false, error: errorMessage(error) };
  }
}

// 登录成功后透明重哈希（导出供 authActions 使用）
export async function maybeUpgradePasswordHash(
  accountId: string,
  plain: string,
  stored: string
): Promise<void> {
  if (!needsPasswordRehash(stored)) return;
  const next = await hashPassword(plain);
  await prisma.account.update({
    where: { id: accountId },
    data: { passwordHash: next },
  });
}
