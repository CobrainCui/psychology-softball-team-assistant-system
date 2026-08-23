import { prisma } from "@/lib/db";
import { canManageSchedule } from "@/lib/auth/policy";
import { canUploadToEvent } from "@/lib/season/invariants";
import type { AuthContext } from "@/lib/auth/types";

export function pendingFileWriterError(
  ctx: AuthContext,
  uploadedById: string,
  kind: "store" | "finalize"
): string | null {
  if (uploadedById === ctx.accountId || canManageSchedule(ctx)) return null;
  return kind === "finalize"
    ? "只能确认自己的上传，或由队长/教练代确认"
    : "只能上传自己的文件";
}

export async function pendingFileEventUploadError(
  teamId: string,
  scheduleEventId: string
): Promise<string | null> {
  const event = await prisma.scheduleEvent.findFirst({
    where: { id: scheduleEventId, teamId },
    include: { season: { select: { status: true } } },
  });
  if (!event) return "事件不存在";
  if (!canUploadToEvent(event.status, event.season?.status ?? null)) {
    return "当前事件不可上传文件";
  }
  return null;
}
