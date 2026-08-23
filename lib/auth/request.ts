import { AsyncLocalStorage } from "node:async_hooks";
import { cookies, headers } from "next/headers";
import { SESSION_COOKIE_NAME } from "@/lib/auth/constants";
import { clientIpFromHeaders } from "@/lib/auth/rateLimit";

let harnessOn = false;
let harnessToken: string | undefined;
let harnessIp = "verify-harness";
const harnessSession = new AsyncLocalStorage<{ token: string }>();

function harnessAllowed(): boolean {
  return harnessOn && process.env.NODE_ENV !== "production";
}

/** 仅 scripts/verify-auth-actions 使用；生产 NODE_ENV 下拒绝开启 */
export function enableAuthVerifyHarness(): void {
  if (process.env.NODE_ENV === "production") {
    throw new Error("verify harness disabled in production");
  }
  harnessOn = true;
}

export function disableAuthVerifyHarness(): void {
  harnessOn = false;
  harnessToken = undefined;
}

export function setHarnessSessionToken(token: string | undefined): void {
  harnessToken = token;
}

export function runWithHarnessSession<T>(
  token: string,
  fn: () => Promise<T>
): Promise<T> {
  return harnessSession.run({ token }, fn);
}

export function setHarnessClientIp(ip: string): void {
  harnessIp = ip;
}

export async function readSessionCookieValue(): Promise<string | undefined> {
  if (harnessAllowed()) {
    return harnessSession.getStore()?.token ?? harnessToken;
  }
  const jar = await cookies();
  return jar.get(SESSION_COOKIE_NAME)?.value;
}

export async function writeSessionCookieValue(
  plain: string,
  expires: Date
): Promise<void> {
  if (harnessAllowed()) {
    harnessToken = plain;
    return;
  }
  const jar = await cookies();
  jar.set(SESSION_COOKIE_NAME, plain, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires,
  });
}

export async function deleteSessionCookieValue(): Promise<void> {
  if (harnessAllowed()) {
    harnessToken = undefined;
    return;
  }
  const jar = await cookies();
  jar.delete(SESSION_COOKIE_NAME);
}

export async function readClientIp(): Promise<string> {
  if (harnessAllowed()) return harnessIp;
  const hdrs = await headers();
  return clientIpFromHeaders(hdrs);
}
