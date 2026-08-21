import { prisma } from "@/lib/db";

const LIMITS: Record<string, { max: number; windowMs: number }> = {
  setup: { max: 3, windowMs: 15 * 60 * 1000 },
  login: { max: 5, windowMs: 15 * 60 * 1000 },
  enroll: { max: 10, windowMs: 15 * 60 * 1000 },
  reset: { max: 5, windowMs: 15 * 60 * 1000 },
  role_grant: { max: 30, windowMs: 15 * 60 * 1000 },
};

/**
 * 推导步骤：读桶 → 窗口过期则重置 → 原子递增 → 超限拒绝
 */
export async function checkRateLimit(
  bucket: string,
  kind: keyof typeof LIMITS
): Promise<{ allowed: true } | { allowed: false; error: string }> {
  const rule = LIMITS[kind];
  const now = new Date();
  const windowEnd = new Date(now.getTime() + rule.windowMs);

  const row = await prisma.authRateLimit.findUnique({ where: { bucket } });

  if (!row || row.windowEnd <= now) {
    await prisma.authRateLimit.upsert({
      where: { bucket },
      create: { bucket, count: 1, windowEnd },
      update: { count: 1, windowEnd },
    });
    return { allowed: true };
  }

  if (row.count >= rule.max) {
    return { allowed: false, error: "操作过于频繁，请稍后再试" };
  }

  await prisma.authRateLimit.update({
    where: { bucket },
    data: { count: { increment: 1 } },
  });
  return { allowed: true };
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
