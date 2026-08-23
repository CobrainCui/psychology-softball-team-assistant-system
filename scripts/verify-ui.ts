/**
 * UI 鉴权与临床文案回归：真实 cookie 会话，不再注入 softball_currentUser。
 * 需本地 `npm run dev`。BASE_URL=http://localhost:3000 npm run verify:ui
 * 必须配置独立 TEST_DATABASE_URL，见 scripts/loadTestDb.ts。
 */
import "./loadTestDb";
import { chromium, type BrowserContext, type Page } from "playwright";
import { writeFileSync } from "fs";
import {
  buildPreFeedback,
  computePhysicalBattery,
  resolveQuadrant,
} from "../lib/clinical/preQuadrant";
import { prisma } from "../lib/db";
import { getOrCreateDefaultTeam } from "../lib/team";
import { hashPassword } from "../lib/auth/password";
import { createSession } from "../lib/auth/session";
import { SESSION_COOKIE_NAME } from "../lib/auth/constants";
import { generateToken, hashToken } from "../lib/auth/tokens";
import { consumePasswordResetToken } from "../lib/auth/resetActions";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const runId = `vu${Date.now().toString(36)}`;
const PASSWORD = "verify-ui-pass-1";

const findings: { level: "pass" | "fail" | "info"; msg: string }[] = [];

function pass(msg: string) {
  findings.push({ level: "pass", msg });
  console.log("PASS", msg);
}
function fail(msg: string) {
  findings.push({ level: "fail", msg });
  console.error("FAIL", msg);
}

async function seedUser(input: {
  teamId: string;
  username: string;
  roles: ("player" | "admin")[];
  claim: "pending" | "approved";
  displayName: string;
}) {
  const passwordHash = await hashPassword(PASSWORD);
  const player =
    input.claim === "approved"
      ? await prisma.player.create({
          data: {
            teamId: input.teamId,
            name: input.displayName,
            role: "player",
          },
        })
      : null;
  const account = await prisma.account.create({
    data: {
      teamId: input.teamId,
      username: input.username,
      passwordHash,
      playerId: player?.id ?? null,
      activeView: "player",
    },
  });
  for (const role of input.roles) {
    await prisma.accountRole.create({
      data: { accountId: account.id, role },
    });
  }
  await prisma.membershipClaim.create({
    data: {
      accountId: account.id,
      status: input.claim,
      displayName: input.displayName,
      playerId: player?.id ?? null,
      reviewedAt: input.claim === "approved" ? new Date() : null,
    },
  });
  return { accountId: account.id, username: input.username, playerName: input.displayName };
}

async function setSessionCookie(context: BrowserContext, token: string) {
  await context.addCookies([
    {
      name: SESSION_COOKIE_NAME,
      value: token,
      url: BASE,
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}

async function cleanup(usernames: string[], playerNames: string[]) {
  const accounts = await prisma.account.findMany({
    where: { username: { in: usernames } },
    select: { id: true },
  });
  const accountIds = accounts.map((a) => a.id);
  if (accountIds.length > 0) {
    await prisma.authSession.deleteMany({
      where: { accountId: { in: accountIds } },
    });
    await prisma.passwordResetToken.deleteMany({
      where: { accountId: { in: accountIds } },
    });
    await prisma.account.deleteMany({ where: { id: { in: accountIds } } });
  }
  await prisma.player.deleteMany({ where: { name: { in: playerNames } } });
}

function checkCalcOffline() {
  if (resolveQuadrant(4, 4) === "peak") pass("quadrant 4,4 → peak");
  else fail("quadrant 4,4 → peak");
  if (resolveQuadrant(4, 2) === "slack") pass("quadrant 4,2 → slack");
  else fail("quadrant 4,2 → slack");
  if (resolveQuadrant(2.5, 1) === "real_fatigue") pass("quadrant 2.5,1 → real_fatigue");
  else fail("quadrant 2.5,1 → real_fatigue");
  if (resolveQuadrant(2.5, 4) === "injury_risk") pass("quadrant 2.5,4 → injury_risk");
  else fail("quadrant 2.5,4 → injury_risk");
  const battery = computePhysicalBattery({
    sleep: 3,
    stress: 3,
    fatigue: 3,
    soreness: 3,
    willingness: 3,
  });
  if (battery === 3) pass("battery all-3 → 3");
  else fail(`battery all-3 → ${battery}`);
  const fb = buildPreFeedback({
    input: { sleep: 5, stress: 5, fatigue: 5, soreness: 5, willingness: 5 },
  });
  if (fb.quadrant === "peak") pass("all-5 feedback peak");
  else fail(`all-5 feedback ${fb.quadrant}`);
}

async function checkAssessment(page: Page) {
  await page.goto(`${BASE}/assessment`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("main h1", { timeout: 30000 });
  const body = await page.locator("main").innerText();
  if (/运动损伤/.test(body)) pass("assessment guides to 运动损伤");
  else fail("assessment missing 运动损伤 guide");
  if (/上场可用性|\/\s*100|Hooper/.test(body)) fail("assessment still shows old score/injury UI");
  else pass("assessment has no old score/injury UI");
}

async function main() {
  checkCalcOffline();
  const usernames: string[] = [];
  const playerNames: string[] = [];

  let reachable = false;
  try {
    const probe = await fetch(`${BASE}/login`, { redirect: "manual" });
    reachable = probe.status > 0;
  } catch {
    reachable = false;
  }
  if (!reachable) {
    fail("dev server not reachable; start npm run dev for UI auth E2E");
    const fails = findings.filter((f) => f.level === "fail");
    console.log("\nSUMMARY fails=", fails.length, "total=", findings.length);
    process.exit(1);
  }

  const anonHome = await fetch(`${BASE}/`, { redirect: "manual" });
  const loc = anonHome.headers.get("location") ?? "";
  if (
    (anonHome.status === 307 || anonHome.status === 308 || anonHome.status === 302) &&
    loc.includes("/login")
  ) {
    pass("anonymous / redirects to /login");
  } else {
    fail(`anonymous / redirects to /login (status ${anonHome.status})`);
  }

  const setupPage = await fetch(`${BASE}/setup`, { redirect: "manual" });
  if (setupPage.status === 200 || setupPage.status === 307 || setupPage.status === 308) {
    pass("setup route reachable or redirects when already initialized");
  } else fail(`setup route reachable (status ${setupPage.status})`);

  const browser = await chromium.launch({ headless: true });
  try {
    const team = await getOrCreateDefaultTeam();
    const player = await seedUser({
      teamId: team.id,
      username: `${runId}_pl`,
      roles: ["player"],
      claim: "approved",
      displayName: `${runId}_pl`,
    });
    const pending = await seedUser({
      teamId: team.id,
      username: `${runId}_pend`,
      roles: ["player"],
      claim: "pending",
      displayName: `${runId}_pend`,
    });
    usernames.push(player.username, pending.username);
    playerNames.push(player.playerName, pending.playerName);

    const loginCtx = await browser.newContext();
    const loginPage = await loginCtx.newPage();
    await loginPage.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
    await loginPage.locator("input").nth(0).fill(player.username);
    await loginPage.locator('input[type="password"]').fill(PASSWORD);
    await loginPage.getByRole("button", { name: "登录" }).click();
    await loginPage.waitForURL(/\/$|\/assessment|\/login/, { timeout: 20000 });
    const afterLogin = loginPage.url();
    if (!afterLogin.includes("/login")) pass("login form sets cookie session");
    else fail("login form sets cookie session");

    await loginPage.getByRole("button", { name: "退出" }).click();
    await loginPage.waitForURL(/\/login/, { timeout: 20000 });
    if (loginPage.url().includes("/login")) pass("logout returns to /login");
    else fail("logout returns to /login");
    await loginCtx.close();

    const pendingToken = await createSession(
      (
        await prisma.account.findUnique({
          where: { username: pending.username },
        })
      )?.id ?? ""
    );
    const pendingCtx = await browser.newContext();
    await setSessionCookie(pendingCtx, pendingToken);
    const pendingPage = await pendingCtx.newPage();
    await pendingPage.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    const pendingText = await pendingPage.locator("main").innerText();
    if (/等待管理员认领/.test(pendingText)) pass("pending user sees claim gate");
    else fail("pending user sees claim gate");
    await pendingCtx.close();

    const playerAccount = await prisma.account.findUnique({
      where: { username: player.username },
    });
    if (playerAccount) {
      const token = generateToken(32);
      await prisma.passwordResetToken.create({
        data: {
          accountId: playerAccount.id,
          tokenHash: hashToken(token),
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        },
      });
      const resetCtx = await browser.newContext();
      const resetPage = await resetCtx.newPage();
      await resetPage.goto(`${BASE}/reset/${token}`, {
        waitUntil: "domcontentloaded",
      });
      const resetBody = await resetPage.locator("main").innerText();
      if (/重置|密码/.test(resetBody)) pass("reset page loads with token");
      else fail("reset page loads with token");
      const consumed = await consumePasswordResetToken(token, "verify-ui-new-99");
      if (consumed.success) pass("reset token can be consumed");
      else fail(`reset token can be consumed (${consumed.success === false ? consumed.error : ""})`);
      await resetCtx.close();
    }

    const approvedToken = await createSession(playerAccount?.id ?? "");
    const appCtx = await browser.newContext();
    await setSessionCookie(appCtx, approvedToken);
    const appPage = await appCtx.newPage();
    await checkAssessment(appPage);
    await appCtx.close();
  } catch (e) {
    fail(`uncaught: ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    await browser.close();
    try {
      await cleanup(usernames, playerNames);
    } catch (error) {
      console.error("cleanup failed:", error);
    }
    const fails = findings.filter((f) => f.level === "fail");
    writeFileSync(
      "tmp-ui-verify.json",
      JSON.stringify({ findings, failCount: fails.length }, null, 2),
      "utf8"
    );
    console.log("\nSUMMARY fails=", fails.length, "total=", findings.length);
    process.exit(fails.length ? 1 : 0);
  }
}

main();
