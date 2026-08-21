import { hash, verify } from "@node-rs/argon2";

/** 开工前固定的 Argon2id v1 参数 */
const ARGON2_OPTIONS = {
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

export const PASSWORD_ALGO_VERSION = 1;
const VERSION_PREFIX = `$argon2id$v=${PASSWORD_ALGO_VERSION}$`;

/**
 * 推导步骤：Argon2id 哈希 → 前缀写入 algoVersion → 存库
 */
export async function hashPassword(plain: string): Promise<string> {
  const digest = await hash(plain, ARGON2_OPTIONS);
  return `${VERSION_PREFIX}${digest}`;
}

export function parsePasswordAlgoVersion(stored: string): number {
  const match = stored.match(/^\$argon2id\$v=(\d+)\$/);
  if (!match) return 0;
  return Number.parseInt(match[1]!, 10);
}

/**
 * 推导步骤：解析版本 → Argon2id verify → timing-safe 由库保证
 */
export async function verifyPassword(
  plain: string,
  stored: string
): Promise<boolean> {
  if (!stored.startsWith(VERSION_PREFIX)) return false;
  const digest = stored.slice(VERSION_PREFIX.length);
  try {
    return await verify(digest, plain, ARGON2_OPTIONS);
  } catch {
    return false;
  }
}

export function needsPasswordRehash(stored: string): boolean {
  return parsePasswordAlgoVersion(stored) < PASSWORD_ALGO_VERSION;
}
