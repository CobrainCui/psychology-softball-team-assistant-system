import { NextResponse } from "next/server";
import type { AuthContext } from "@/lib/auth/types";
import { requireSession } from "@/lib/auth/requireSession";
import {
  assertApproved,
  canArchiveTestSession,
} from "@/lib/auth/policy";

type ApiAuthOk = { ok: true; ctx: AuthContext };
type ApiAuthErr = { ok: false; response: NextResponse };

function deny(status: number, error: string): ApiAuthErr {
  return {
    ok: false,
    response: NextResponse.json({ error }, { status }),
  };
}

export async function requireApiSession(): Promise<ApiAuthOk | ApiAuthErr> {
  const res = await requireSession();
  if (!res.ok) return deny(401, res.error);
  return { ok: true, ctx: res.ctx };
}

export async function requireApiApproved(): Promise<
  (ApiAuthOk & { playerId: string }) | ApiAuthErr
> {
  const session = await requireApiSession();
  if (!session.ok) return session;
  const approved = assertApproved(session.ctx);
  if (!approved.ok) return deny(403, approved.error);
  return { ok: true, ctx: session.ctx, playerId: approved.playerId };
}

export async function requireApiArchiver(): Promise<ApiAuthOk | ApiAuthErr> {
  const session = await requireApiSession();
  if (!session.ok) return session;
  if (!canArchiveTestSession(session.ctx)) {
    return deny(403, "仅队长或教练可归档或新建名册队员");
  }
  return session;
}
