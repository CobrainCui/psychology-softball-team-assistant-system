import { prisma } from "@/lib/db";
import { Prisma } from "@/lib/generated/prisma/client";
import {
  nextRateLimitState,
  RATE_LIMIT_RULES,
  type RateLimitKind,
} from "@/lib/auth/rateLimitPolicy";

type LockedRateRow = {
  bucket: string;
  count: number;
  windowEnd: Date | string;
};

async function lockRateLimitRow(
  tx: Pick<typeof prisma, "$queryRaw">,
  bucket: string
): Promise<LockedRateRow | null> {
  const rows = await tx.$queryRaw<LockedRateRow[]>`
    SELECT bucket, count, "windowEnd"
    FROM "AuthRateLimit"
    WHERE bucket = ${bucket}
    FOR UPDATE
  `;
  return rows[0] ?? null;
}

/**
 * 推导步骤：事务内 FOR UPDATE 读桶 → nextRateLimitState → 写入；无行则创建，撞唯一约束则重锁。
 */
export async function checkRateLimit(
  bucket: string,
  kind: RateLimitKind
): Promise<{ allowed: true } | { allowed: false; error: string }> {
  const rule = RATE_LIMIT_RULES[kind];
  const denied = {
    allowed: false as const,
    error: "操作过于频繁，请稍后再试",
  };

  try {
    return await prisma.$transaction(async (tx) => {
      let row = await lockRateLimitRow(tx, bucket);
      const now = new Date();

      if (!row) {
        const next = nextRateLimitState({
          nowMs: now.getTime(),
          existing: null,
          max: rule.max,
          windowMs: rule.windowMs,
        });
        try {
          await tx.authRateLimit.create({
            data: {
              bucket,
              count: next.count,
              windowEnd: new Date(next.windowEndMs),
            },
          });
          return { allowed: true as const };
        } catch (error) {
          if (
            !(
              error instanceof Prisma.PrismaClientKnownRequestError &&
              error.code === "P2002"
            )
          ) {
            throw error;
          }
          row = await lockRateLimitRow(tx, bucket);
          if (!row) throw error;
        }
      }

      const next = nextRateLimitState({
        nowMs: now.getTime(),
        existing: {
          count: row.count,
          windowEndMs: new Date(row.windowEnd).getTime(),
        },
        max: rule.max,
        windowMs: rule.windowMs,
      });
      if (!next.allowed) return denied;
      await tx.authRateLimit.update({
        where: { bucket },
        data: {
          count: next.count,
          windowEnd: new Date(next.windowEndMs),
        },
      });
      return { allowed: true as const };
    });
  } catch (error) {
    console.error("限流检查失败:", error);
    return denied;
  }
}

export function clientIpFromHeaders(
  headers: Headers | { get(name: string): string | null }
): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return headers.get("x-real-ip") ?? "unknown";
}
