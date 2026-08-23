/**
 * 写库回归脚本必须先 import 本文件，再 import Prisma。
 * 强制 TEST_DATABASE_URL，且规范化后不得与 DATABASE_URL 相同。
 */
import { config } from "dotenv";

config();

function normalizeDbUrl(url: string): string {
  return url.trim().replace(/^["']|["']$/g, "").trim();
}

const testUrlRaw = process.env.TEST_DATABASE_URL;
if (!testUrlRaw || !normalizeDbUrl(testUrlRaw)) {
  console.error(
    "verify 脚本必须设置 TEST_DATABASE_URL，禁止对应用 DATABASE_URL（生产/开发库）写入。"
  );
  process.exit(1);
}

const testUrl = normalizeDbUrl(testUrlRaw);
const appUrlRaw = process.env.DATABASE_URL;
if (appUrlRaw && normalizeDbUrl(appUrlRaw) === testUrl) {
  console.error(
    "TEST_DATABASE_URL 规范化后不得与 DATABASE_URL 相同。请指向独立测试库。"
  );
  process.exit(1);
}

process.env.DATABASE_URL = testUrl;
