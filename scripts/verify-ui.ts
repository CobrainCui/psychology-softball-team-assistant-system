/**
 * Status / injury UI verification. Injects session to avoid login hangs.
 * BASE_URL=http://localhost:3000 npx tsx scripts/verify-ui.ts
 */
import { chromium, type Page } from "playwright";
import { writeFileSync } from "fs";
import {
  buildPreFeedback,
  computePhysicalBattery,
  resolveQuadrant,
} from "../lib/clinical/preQuadrant";

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

  if (/新发伤病|历史伤病追踪|疼痛部位|上场可用性|\/\s*100|满负荷|Hooper/.test(body)) {
    fail("assessment still shows old score/injury UI");
  } else {
    pass("assessment has no old score/injury UI");
  }

  const ranges = page.locator('main input[type="range"]');
  const count = await ranges.count();
  info(`assessment range inputs: ${count}`);
  if (count >= 5) pass("assessment has five wellness sliders");
  else fail(`assessment slider count ${count} < 5`);

  page.on("dialog", async (d) => {
    info(`alert: ${d.message()}`);
    await d.accept();
  });

  await page.getByRole("button", { name: /生成今日四象限反馈/ }).click();
  await page.waitForTimeout(3500);
  const after = await page.locator("main").innerText();
  if (/\/\s*100/.test(after)) fail("assessment still shows / 100");
  else pass("assessment has no / 100 after generate");
  if (/身体准备好了|身心都在说|心里很想动|身体和动力/.test(after)) {
    pass("quadrant title rendered");
  } else fail("quadrant title missing after generate");
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
    if (await btn.count()) fail(`old tab still present: ${tab}`);
    else pass(`old tab gone: ${tab}`);
  }
  if (await page.getByRole("button", { name: /新建损伤记录/ }).count()) {
    pass("new case button present");
  } else fail("new case button missing");
  if (/上场可用性|限制性可用|伤缺/.test(await main.innerText())) {
    fail("prehab still shows availability");
  } else pass("prehab has no availability copy");
}

async function checkProfile(page: Page) {
  await page.goto(`${BASE}/profile`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("main", { timeout: 30000 });
  await page.waitForTimeout(2000);
  const text = await page.locator("main").innerText();
  if (/最近象限/.test(text)) pass("profile shows 最近象限");
  else fail("profile missing 最近象限");
  if (/上场可用性/.test(text)) fail("profile still shows 上场可用性");
  else pass("profile has no 上场可用性");
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
  const peak = resolveQuadrant(4, 4);
  const slack = resolveQuadrant(4, 2);
  const fatigue = resolveQuadrant(2.5, 1);
  const risk = resolveQuadrant(2.5, 4);
  if (peak === "peak") pass("quadrant 4,4 → peak");
  else fail(`quadrant 4,4 → ${peak}`);
  if (slack === "slack") pass("quadrant 4,2 → slack");
  else fail(`quadrant 4,2 → ${slack}`);
  if (fatigue === "real_fatigue") pass("quadrant 2.5,1 → real_fatigue");
  else fail(`quadrant 2.5,1 → ${fatigue}`);
  if (risk === "injury_risk") pass("quadrant 2.5,4 → injury_risk");
  else fail(`quadrant 2.5,4 → ${risk}`);

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
    input: {
      sleep: 5,
      stress: 5,
      fatigue: 5,
      soreness: 5,
      willingness: 5,
    },
  });
  if (fb.quadrant === "peak") pass("all-5 feedback peak");
  else fail(`all-5 feedback ${fb.quadrant}`);
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
