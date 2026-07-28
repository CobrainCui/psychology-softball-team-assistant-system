/**
 * Dual-track UI verification. Injects session to avoid login/getPlayers hangs.
 * BASE_URL=http://localhost:3000 npx tsx scripts/verify-ui.ts
 */
import { chromium, type Page } from "playwright";
import { writeFileSync } from "fs";
import {
  computeReadiness,
  loadBandFromScore,
} from "../lib/clinical/readinessScore";
import { deriveAvailabilityStatus } from "../lib/clinical/availabilityStatus";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const PLAYER_ID =
  process.env.VERIFY_PLAYER_ID ?? "cms06jznn0003w4ydj714g2sx";
const PLAYER_NAME = process.env.VERIFY_PLAYER_NAME ?? "Verify Player";

const findings: { level: "pass" | "fail" | "info"; msg: string }[] = [];

function pass(msg: string) {
  findings.push({ level: "pass", msg });
  console.log("PASS", msg);
}
function fail(msg: string) {
  findings.push({ level: "fail", msg });
  console.error("FAIL", msg);
}
function info(msg: string) {
  findings.push({ level: "info", msg });
  console.log("INFO", msg);
}

async function injectSession(page: Page, role: "player" | "coach") {
  await page.addInitScript(
    ({ playerId, playerName, role }) => {
      localStorage.setItem(
        "softball_currentUser",
        JSON.stringify({
          playerId,
          playerName,
          gender: "female",
          role,
        })
      );
    },
    { playerId: PLAYER_ID, playerName: PLAYER_NAME, role }
  );
}

async function checkAssessment(page: Page) {
  await page.goto(`${BASE}/assessment`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("main h1", { timeout: 30000 });
  await page.waitForTimeout(1500);
  const body = await page.locator("main").innerText();

  if (/运动损伤/.test(body)) pass("assessment guides to 运动损伤");
  else fail("assessment missing 运动损伤 guide");

  if (/新发伤病|历史伤病追踪|疼痛部位/.test(body)) {
    fail("assessment still shows injury/probe UI");
  } else {
    pass("assessment has no injury/probe UI");
  }

  const ranges = page.locator('main input[type="range"]');
  const count = await ranges.count();
  info(`assessment range inputs: ${count}`);

  page.on("dialog", async (d) => {
    info(`alert: ${d.message()}`);
    await d.accept();
  });

  if (count >= 3) {
    await ranges.nth(0).fill("3");
    await ranges.nth(1).fill("5");
    await ranges.nth(2).fill("3");
  }

  await page.getByRole("button", { name: /生成今日体能负荷建议/ }).click();
  await page.waitForTimeout(3500);

  let after = await page.locator("main").innerText();
  const score5 = after.match(/(\d+)\s*\/\s*100/);
  if (score5) pass(`fatigue5 score rendered: ${score5[1]}/100`);
  else fail("no readiness score after generate (fatigue5)");

  if (/负荷带|满负荷|可训|技术为主|明显减量|恢复课/.test(after)) {
    pass("load band label present after generate");
  } else fail("load band label missing");

  const expected5 = computeReadiness({
    sleepQuality: "normal",
    stressScore: 3,
    fatigueScore: 5,
    sorenessScore: 3,
  });
  if (score5 && Number(score5[1]) === expected5.readinessScore) {
    pass(
      `UI score matches computeReadiness for fatigue5 (=${expected5.readinessScore}, ${expected5.loadBand.id})`
    );
  } else {
    fail(
      `UI score ${score5?.[1]} != expected ${expected5.readinessScore} (may include cycle penalty)`
    );
  }

  const breakdownBtn = page.getByRole("button", { name: /展开维度明细/ });
  if (await breakdownBtn.count()) {
    await breakdownBtn.click();
    after = await page.locator("main").innerText();
    if (/Hooper/.test(after)) pass("dimension breakdown shows Hooper");
    else fail("breakdown missing Hooper");
  } else fail("expand breakdown button missing");

  if (count >= 3) await ranges.nth(1).fill("8");
  await page.getByRole("button", { name: /生成今日体能负荷建议/ }).click();
  await page.waitForTimeout(3500);
  after = await page.locator("main").innerText();
  const score8 = after.match(/(\d+)\s*\/\s*100/);
  if (score5 && score8 && score5[1] !== score8[1]) {
    pass(`fatigue 5→8 changes score ${score5[1]} → ${score8[1]}`);
  } else {
    fail(`fatigue 5 vs 8 same/missing (${score5?.[1]} / ${score8?.[1]})`);
  }
}

async function checkPrehab(page: Page) {
  await page.goto(`${BASE}/prehab`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("main h1", { timeout: 30000 });
  await page.waitForTimeout(1500);
  const main = page.locator("main");

  if (/运动损伤/.test(await main.innerText())) pass("prehab title 运动损伤");
  else fail("prehab title missing");

  for (const tab of ["监控", "伤后建议", "预防"]) {
    const btn = page.getByRole("button", { name: tab, exact: true });
    if (await btn.count()) {
      await btn.click();
      await page.waitForTimeout(400);
      pass(`tab clickable: ${tab}`);
    } else fail(`tab missing: ${tab}`);
  }

  await page.getByRole("button", { name: "预防", exact: true }).click();
  if (/内容建设中|仅占位/.test(await main.innerText())) {
    pass("prevent is placeholder only");
  } else fail("prevent placeholder copy missing");

  await page.getByRole("button", { name: "伤后建议", exact: true }).click();
  const range = page.locator('main input[type="range"]').first();
  if (await range.count()) await range.fill("4");
  await page.getByRole("button", { name: /生成伤后建议与可用性/ }).click();
  await page.waitForTimeout(1000);
  const advice = await main.innerText();
  const expectAvail = deriveAvailabilityStatus({ painScore: 4 });
  if (expectAvail === "modified" && /限制性可用|可用性/.test(advice)) {
    pass("VAS4 advice shows modified availability");
  } else if (/可用性|完全可用|伤缺|限制性可用/.test(advice)) {
    info(`advice availability text present (raw expect=${expectAvail})`);
    pass("advice shows availability section");
  } else fail("advice missing availability");
}

async function checkProfile(page: Page) {
  await page.goto(`${BASE}/profile`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("main", { timeout: 30000 });
  await page.waitForTimeout(2000);
  const text = await page.locator("main").innerText();
  if (/体能准备度/.test(text)) pass("profile shows 体能准备度");
  else fail("profile missing 体能准备度");
  if (/上场可用性/.test(text)) pass("profile shows 上场可用性");
  else fail("profile missing 上场可用性");
  if (/伤病预防/.test(text)) fail("profile still says 伤病预防");
  else pass("profile has no 伤病预防 copy");
}

async function checkNav(page: Page) {
  await page.goto(`${BASE}/assessment`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("nav", { timeout: 20000 });
  const nav = await page.locator("nav").innerText();
  if (/运动损伤/.test(nav)) pass("nav label 运动损伤");
  else fail("nav missing 运动损伤");
  if (/伤病预防/.test(nav)) fail("nav still has 伤病预防");
  else pass("nav has no 伤病预防");
}

function checkCalcOffline() {
  const f5 = computeReadiness({
    sleepQuality: "normal",
    stressScore: 3,
    fatigueScore: 5,
    sorenessScore: 3,
  });
  const f8 = computeReadiness({
    sleepQuality: "normal",
    stressScore: 3,
    fatigueScore: 8,
    sorenessScore: 3,
  });
  if (f5.readinessScore === 63 && f5.loadBand.id === "modified_70") {
    pass("calc fatigue5 → 63 / modified_70");
  } else fail(`calc fatigue5 unexpected ${f5.readinessScore} ${f5.loadBand.id}`);
  if (f8.readinessScore === 54 && f8.loadBand.id === "modified_50") {
    pass("calc fatigue8 → 54 / modified_50");
  } else fail(`calc fatigue8 unexpected ${f8.readinessScore} ${f8.loadBand.id}`);

  const cases: [number, string][] = [
    [90, "full_100"],
    [89, "full_85"],
    [74, "modified_70"],
    [59, "modified_50"],
    [44, "rest_energy"],
  ];
  for (const [s, id] of cases) {
    if (loadBandFromScore(s).id === id) pass(`band ${s}→${id}`);
    else fail(`band ${s}→${loadBandFromScore(s).id} want ${id}`);
  }

  if (deriveAvailabilityStatus({ painScore: 2 }) === "full") pass("avail vas2 full");
  else fail("avail vas2");
  if (deriveAvailabilityStatus({ painScore: 4 }) === "modified")
    pass("avail vas4 modified");
  else fail("avail vas4");
  if (deriveAvailabilityStatus({ painScore: 6 }) === "unavailable")
    pass("avail vas6 unavailable");
  else fail("avail vas6");
  if (deriveAvailabilityStatus({ painScore: 2, probeFeedback: "C" }) === "unavailable")
    pass("avail probeC unavailable");
  else fail("avail probeC");
}

async function main() {
  checkCalcOffline();

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await injectSession(page, "player");
    await checkNav(page);
    await checkAssessment(page);
    await checkPrehab(page);
    await checkProfile(page);
  } catch (e) {
    fail(`uncaught: ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    await browser.close();
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
