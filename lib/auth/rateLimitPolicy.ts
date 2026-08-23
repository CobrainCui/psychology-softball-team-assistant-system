export const RATE_LIMIT_KINDS = [
  "setup",
  "login",
  "enroll",
  "reset",
  "role_grant",
] as const;
export type RateLimitKind = (typeof RATE_LIMIT_KINDS)[number];

export const RATE_LIMIT_RULES: Record<
  RateLimitKind,
  { max: number; windowMs: number }
> = {
  setup: { max: 3, windowMs: 15 * 60 * 1000 },
  login: { max: 5, windowMs: 15 * 60 * 1000 },
  enroll: { max: 10, windowMs: 15 * 60 * 1000 },
  reset: { max: 5, windowMs: 15 * 60 * 1000 },
  role_grant: { max: 30, windowMs: 15 * 60 * 1000 },
};

export type RateLimitState = {
  count: number;
  windowEndMs: number;
  allowed: boolean;
};

// 推导步骤：窗口过期则重置为 1；已满则保持计数并拒绝；否则加一。调用方须在行锁内应用。
export function nextRateLimitState(input: {
  nowMs: number;
  existing: { count: number; windowEndMs: number } | null;
  max: number;
  windowMs: number;
}): RateLimitState {
  if (!input.existing || input.existing.windowEndMs <= input.nowMs) {
    return {
      count: 1,
      windowEndMs: input.nowMs + input.windowMs,
      allowed: true,
    };
  }
  if (input.existing.count >= input.max) {
    return {
      count: input.existing.count,
      windowEndMs: input.existing.windowEndMs,
      allowed: false,
    };
  }
  return {
    count: input.existing.count + 1,
    windowEndMs: input.existing.windowEndMs,
    allowed: true,
  };
}
