import { prisma } from "@/lib/db";
import {
  SESSION_COOKIE_NAME,
  SESSION_TTL_DAYS,
} from "@/lib/auth/constants";
import { generateToken, hashToken } from "@/lib/auth/tokens";
import {
  accountAuthInclude,
  buildAuthContext,
} from "@/lib/auth/context";
import type { AuthContext } from "@/lib/auth/types";
import {
  deleteSessionCookieValue,
  readSessionCookieValue,
  writeSessionCookieValue,
} from "@/lib/auth/request";

function sessionExpiresAt(): Date {
  return new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
}

export async function createSession(accountId: string): Promise<string> {
  const plain = generateToken(32);
  const tokenHash = hashToken(plain);
  await prisma.authSession.create({
    data: {
      accountId,
      tokenHash,
      expiresAt: sessionExpiresAt(),
    },
  });
  return plain;
}

export async function revokeAllSessions(accountId: string): Promise<void> {
  await prisma.authSession.deleteMany({ where: { accountId } });
}

export async function revokeSessionByToken(plain: string): Promise<void> {
  const tokenHash = hashToken(plain);
  await prisma.authSession.deleteMany({ where: { tokenHash } });
}

export async function setSessionCookie(plain: string): Promise<void> {
  await writeSessionCookieValue(plain, sessionExpiresAt());
}

export async function clearSessionCookie(): Promise<void> {
  await deleteSessionCookieValue();
}

async function loadAccountBySessionToken(
  plain: string | undefined
): Promise<AuthContext | null> {
  if (!plain) return null;
  const tokenHash = hashToken(plain);
  const session = await prisma.authSession.findUnique({
    where: { tokenHash },
    include: {
      account: {
        include: accountAuthInclude,
      },
    },
  });
  if (!session) return null;
  if (session.expiresAt <= new Date()) {
    await prisma.authSession.delete({ where: { id: session.id } });
    return null;
  }
  if (session.account.status !== "active") return null;
  return buildAuthContext(session.account);
}

export async function getSessionFromCookie(): Promise<AuthContext | null> {
  const plain = await readSessionCookieValue();
  return loadAccountBySessionToken(plain);
}

/** 测试 / verify-auth-actions 注入用 */
export async function getSessionFromToken(
  plain: string
): Promise<AuthContext | null> {
  return loadAccountBySessionToken(plain);
}

export { SESSION_COOKIE_NAME };
