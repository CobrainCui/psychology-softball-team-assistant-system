import type { ActionResult } from "@/lib/actionResult";
import { getSessionFromCookie } from "@/lib/auth/session";
import type { AuthContext } from "@/lib/auth/types";

export type RequireSessionResult =
  | { ok: true; ctx: AuthContext }
  | { ok: false; error: string };

export async function requireSession(): Promise<RequireSessionResult> {
  const ctx = await getSessionFromCookie();
  if (!ctx) {
    return { ok: false, error: "未登录或会话已失效" };
  }
  return { ok: true, ctx };
}

export async function requireSessionAction(): Promise<
  ActionResult<{ ctx: AuthContext }>
> {
  const res = await requireSession();
  if (!res.ok) return { success: false, error: res.error };
  return { success: true, ctx: res.ctx };
}
