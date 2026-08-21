"use server";

import { prisma } from "@/lib/db";
import type { ActionResult } from "@/lib/actionResult";
import { errorMessage } from "@/lib/actionResult";
import { toSessionUser } from "@/lib/auth/context";
import { requireSessionAction } from "@/lib/auth/requireSession";
import type { ActiveView, SessionUser } from "@/lib/auth/types";

export async function getMe(): Promise<
  ActionResult<{ user: SessionUser | null }>
> {
  try {
    const session = await requireSessionAction();
    if (!session.success) {
      return { success: true, user: null };
    }
    return { success: true, user: toSessionUser(session.ctx) };
  } catch (error) {
    console.error("getMe 失败:", error);
    return { success: false, error: errorMessage(error) };
  }
}

export async function switchActiveView(
  view: ActiveView
): Promise<ActionResult<{ activeView: ActiveView }>> {
  try {
    const session = await requireSessionAction();
    if (!session.success) return session;

    if (!session.ctx.roles.includes(view) && view !== "player") {
      return { success: false, error: "尚未被授予该工作视图角色" };
    }
    if (view === "player" && !session.ctx.roles.includes("player")) {
      return { success: false, error: "尚未被授予队员角色" };
    }

    await prisma.account.update({
      where: { id: session.ctx.accountId },
      data: { activeView: view },
    });

    return { success: true, activeView: view };
  } catch (error) {
    console.error("切换视图失败:", error);
    return { success: false, error: errorMessage(error) };
  }
}
