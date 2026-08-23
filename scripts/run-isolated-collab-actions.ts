/**
 * 在应用库同一 Postgres 上创建独立 softball_ai_collab_verify，
 * 对其 migrate deploy，再跑 verify:test-day-collab-actions。
 * 不打印连接串。
 */
import { spawn } from "node:child_process";
import { config } from "dotenv";
import pg from "pg";

config();

const TEST_DB_NAME = "softball_ai_collab_verify";

function normalizeDbUrl(url: string): string {
  return url.trim().replace(/^["']|["']$/g, "").trim();
}

function parseDbUrl(raw: string): URL {
  const normalized = normalizeDbUrl(raw).replace(/^postgres:\/\//, "postgresql://");
  return new URL(normalized);
}

function withDatabaseName(raw: string, dbName: string): string {
  const original = normalizeDbUrl(raw);
  const parsed = parseDbUrl(original);
  parsed.pathname = `/${dbName}`;
  const next = parsed.toString();
  return original.startsWith("postgres://")
    ? next.replace(/^postgresql:\/\//, "postgres://")
    : next;
}

function currentDatabaseName(raw: string): string {
  return parseDbUrl(raw).pathname.replace(/^\//, "").split("/")[0] ?? "";
}

function run(command: string, args: string[], env: NodeJS.ProcessEnv): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env,
      stdio: "inherit",
      shell: true,
    });
    child.on("error", reject);
    child.on("close", (code) => resolve(code ?? 1));
  });
}

async function main() {
  const appUrlRaw = process.env.DATABASE_URL;
  if (!appUrlRaw || !normalizeDbUrl(appUrlRaw)) {
    console.error("缺少 DATABASE_URL，无法派生独立测试库。");
    process.exit(1);
  }
  const appUrl = normalizeDbUrl(appUrlRaw);
  const appDb = currentDatabaseName(appUrl);
  if (appDb === TEST_DB_NAME) {
    console.error("应用库已是 softball_ai_collab_verify，拒绝覆盖。");
    process.exit(1);
  }

  const testUrl = withDatabaseName(appUrl, TEST_DB_NAME);
  const client = new pg.Client({ connectionString: appUrl });
  try {
    await client.connect();
    const found = await client.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [TEST_DB_NAME]
    );
    if (found.rowCount === 0) {
      console.log(`创建独立测试库 ${TEST_DB_NAME}`);
      await client.query(`CREATE DATABASE "${TEST_DB_NAME}"`);
    } else {
      console.log(`复用已有独立测试库 ${TEST_DB_NAME}`);
    }
  } catch (error) {
    console.error(
      "无法在当前 Postgres 上创建独立测试库:",
      error instanceof Error ? error.message : String(error)
    );
    process.exit(1);
  } finally {
    await client.end().catch(() => undefined);
  }

  const migrateCode = await run("npx", ["prisma", "migrate", "deploy"], {
    ...process.env,
    DATABASE_URL: testUrl,
  });
  if (migrateCode !== 0) {
    console.error("测试库 migrate deploy 失败");
    process.exit(migrateCode);
  }

  const verifyScripts = [
    "scripts/verify-test-day-collab-actions.ts",
    "scripts/verify-auth-actions.ts",
    "scripts/verify-season.ts",
  ];
  for (const file of verifyScripts) {
    console.log(`运行 ${file}`);
    const verifyCode = await run("npx", ["--yes", "tsx", file], {
      ...process.env,
      DATABASE_URL: appUrl,
      TEST_DATABASE_URL: testUrl,
    });
    if (verifyCode !== 0) {
      console.error(`${file} 失败`);
      process.exit(verifyCode);
    }
  }
  process.exit(0);
}

void main();
