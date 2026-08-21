import { prisma } from "@/lib/db";

export async function writeAuditLog(input: {
  action: string;
  actorAccountId?: string | null;
  targetAccountId?: string | null;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
  ip?: string | null;
}): Promise<void> {
  try {
    await prisma.authAuditLog.create({
      data: {
        action: input.action,
        actorAccountId: input.actorAccountId ?? null,
        targetAccountId: input.targetAccountId ?? null,
        targetId: input.targetId ?? null,
        metadata: (input.metadata ?? undefined) as object | undefined,
        ip: input.ip ?? null,
      },
    });
  } catch (error) {
    console.error("审计日志写入失败:", error);
  }
}
