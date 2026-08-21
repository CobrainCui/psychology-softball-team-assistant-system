import { createHash, randomBytes, timingSafeEqual } from "crypto";

/** 生成 URL-safe 随机 token（明文仅展示一次） */
export function generateToken(byteLength = 32): string {
  return randomBytes(byteLength).toString("base64url");
}

export function hashToken(plain: string): string {
  return createHash("sha256").update(plain).digest("hex");
}

export function safeEqualToken(plain: string, storedHash: string): boolean {
  const computed = hashToken(plain);
  const a = Buffer.from(computed, "utf8");
  const b = Buffer.from(storedHash, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** 入队码：大写字母数字，带分隔符便于手输 */
export function generateEnrollmentCodePlain(length = 16): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(length);
  let raw = "";
  for (let i = 0; i < length; i++) {
    raw += alphabet[bytes[i]! % alphabet.length];
  }
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}`;
}

export function normalizeEnrollmentCodeInput(input: string): string {
  return input.replace(/-/g, "").trim().toUpperCase();
}
