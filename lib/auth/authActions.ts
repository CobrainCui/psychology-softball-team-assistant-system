"use server";

import { prisma } from "@/lib/db";
import { getOrCreateDefaultTeam } from "@/lib/team";
import type { ActionResult } from "@/lib/actionResult";
import { errorMessage } from "@/lib/actionResult";
import { writeAuditLog } from "@/lib/auth/audit";
import { USERNAME_RE } from "@/lib/auth/constants";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { maybeUpgradePasswordHash } from "@/lib/auth/enrollActions";
import { checkRateLimit } from "@/lib/auth/rateLimit";
import {
  clearSessionCookie,
  createSession,
  revokeAllSessions,
  revokeSessionByToken,
  setSessionCookie,
} from "@/lib/auth/session";
import { readClientIp, readSessionCookieValue } from "@/lib/auth/request";
import { requireSessionAction } from "@/lib/auth/requireSession";

export async function login(
  username: string,
  password: string
): Promise<ActionResult> {
  try {
    const ip = await readClientIp();
    const normalized = username.trim().toLowerCase();
    const rate = await checkRateLimit(`login:${ip}:${normalized}`, "login");
    if (!rate.allowed) return { success: false, error: rate.error };

    const account = await prisma.account.findUnique({
      where: { username: normalized },
    });
    if (!account || account.status !== "active") {
      return { success: false, error: "用户名或密码错误" };
    }

    const ok = await verifyPassword(password, account.passwordHash);
    if (!ok) {
      return { success: false, error: "用户名或密码错误" };
    }

    await maybeUpgradePasswordHash(account.id, password, account.passwordHash);

    const token = await createSession(account.id);
    await setSessionCookie(token);

    await writeAuditLog({
      action: "login",
      actorAccountId: account.id,
      ip,
    });

    return { success: true };
  } catch (error) {
    console.error("登录失败:", error);
    return { success: false, error: errorMessage(error) };
  }
}

export async function logout(): Promise<ActionResult> {
  try {
    const plain = await readSessionCookieValue();
    if (plain) {
      await revokeSessionByToken(plain);
    }
    await clearSessionCookie();
    return { success: true };
  } catch (error) {
    console.error("退出失败:", error);
    return { success: false, error: errorMessage(error) };
  }
}

export async function bootstrapAdmin(payload: {
  secret: string;
  username: string;
  password: string;
}): Promise<ActionResult> {
  try {
    const expected = process.env.AUTH_BOOTSTRAP_SECRET;
    if (!expected) {
      return { success: false, error: "系统未配置初始化密钥" };
    }
    if (payload.secret !== expected) {
      return { success: false, error: "初始化密钥错误" };
    }

    const ip = await readClientIp();
    const rate = await checkRateLimit(`setup:${ip}`, "setup");
    if (!rate.allowed) return { success: false, error: rate.error };

    const username = payload.username.trim().toLowerCase();
    if (!USERNAME_RE.test(username)) {
      return { success: false, error: "用户名格式无效" };
    }
    if (payload.password.length < 8) {
      return { success: false, error: "密码至少 8 位" };
    }

    const team = await getOrCreateDefaultTeam();
    const passwordHash = await hashPassword(payload.password);

    await prisma.$transaction(async (tx) => {
      const adminCount = await tx.accountRole.count({
        where: { role: "admin" },
      });
      if (adminCount > 0) {
        throw new Error("系统已初始化，无法重复创建管理员");
      }

      const existing = await tx.account.findUnique({ where: { username } });
      if (existing) throw new Error("用户名已被占用");

      // 推导步骤：先建名册 Player → 绑定 Account.playerId → approved Claim
      // 否则 PendingClaimGate 会因无 playerId 锁死 /admin
      const player = await tx.player.create({
        data: {
          teamId: team.id,
          name: username,
          role: "player",
        },
      });

      const account = await tx.account.create({
        data: {
          teamId: team.id,
          username,
          passwordHash,
          activeView: "player",
          playerId: player.id,
        },
      });

      await tx.accountRole.create({
        data: { accountId: account.id, role: "admin" },
      });
      await tx.accountRole.create({
        data: { accountId: account.id, role: "player" },
      });

      await tx.membershipClaim.create({
        data: {
          accountId: account.id,
          status: "approved",
          displayName: username,
          playerId: player.id,
          reviewedAt: new Date(),
        },
      });
    });

    await writeAuditLog({ action: "setup_admin", ip, metadata: { username } });
    return { success: true };
  } catch (error) {
    console.error("初始化失败:", error);
    return { success: false, error: errorMessage(error) };
  }
}

export async function changePassword(payload: {
  currentPassword: string;
  newPassword: string;
}): Promise<ActionResult> {
  try {
    const session = await requireSessionAction();
    if (!session.success) return session;
    if (payload.newPassword.length < 8) {
      return { success: false, error: "新密码至少 8 位" };
    }

    const account = await prisma.account.findUnique({
      where: { id: session.ctx.accountId },
    });
    if (!account) return { success: false, error: "账户不存在" };

    const ok = await verifyPassword(
      payload.currentPassword,
      account.passwordHash
    );
    if (!ok) return { success: false, error: "当前密码错误" };

    const passwordHash = await hashPassword(payload.newPassword);
    await prisma.account.update({
      where: { id: account.id },
      data: { passwordHash },
    });
    await revokeAllSessions(account.id);

    await writeAuditLog({
      action: "password_changed",
      actorAccountId: account.id,
    });

    return { success: true };
  } catch (error) {
    console.error("改密失败:", error);
    return { success: false, error: errorMessage(error) };
  }
}

export async function isSetupRequired(): Promise<
  ActionResult<{ required: boolean }>
> {
  try {
    const adminCount = await prisma.accountRole.count({
      where: { role: "admin" },
    });
    return { success: true, required: adminCount === 0 };
  } catch (error) {
    return { success: false, error: errorMessage(error) };
  }
}
