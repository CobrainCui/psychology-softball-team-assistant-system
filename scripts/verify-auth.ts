/**
 * 账密原语与策略回归（纯函数 + 不依赖 DB 的分支）
 * npm run verify:auth
 */
import {
  hashPassword,
  verifyPassword,
  parsePasswordAlgoVersion,
  PASSWORD_ALGO_VERSION,
} from "../lib/auth/password";
import {
  generateEnrollmentCodePlain,
  hashToken,
  normalizeEnrollmentCodeInput,
  safeEqualToken,
} from "../lib/auth/tokens";
import type { AuthContext } from "../lib/auth/types";
import {
  canArchiveTestSession,
  canArchiveTestSessionFromUser,
  canCreateTestDayDraft,
  canJoinTestDayDraft,
  canMutateTestDayDraftStructure,
  canManageAccounts,
  canManageSeason,
  canViewSchedule,
  canViewTeamHealth,
  canViewTeamOps,
  canViewTeamSeasonReports,
  canWriteOwnHealthData,
  coachHealthFieldAllowed,
  canViewTestDayDraftSnapshot,
} from "../lib/auth/policy";
import { nextRateLimitState } from "../lib/auth/rateLimitPolicy";
import {
  findForbiddenCoachDtoKey,
} from "../lib/auth/coachDtoGuard";
import { buildGuestDraftDto } from "../lib/testDay/collab/dto";
import { resolvePublicAppOrigin } from "../lib/auth/publicOrigin";
import { getTodayDateStr } from "../lib/dateOnly";
import {
  getTeamTodayDateStr,
  isTeamTodayDateOnly,
  isWithinTestDayArchiveWindow,
} from "../lib/season/timeZone";
import { rejectIfNotToday } from "../lib/status/shared";

const findings: { level: "pass" | "fail"; msg: string }[] = [];

function pass(msg: string) {
  findings.push({ level: "pass", msg });
  console.log("PASS", msg);
}
function fail(msg: string) {
  findings.push({ level: "fail", msg });
  console.error("FAIL", msg);
}

function ctx(partial: Partial<AuthContext> & Pick<AuthContext, "roles">): AuthContext {
  return {
    accountId: "a1",
    username: "u1",
    teamId: "t1",
    teamTimeZone: "Asia/Shanghai",
    playerId: partial.playerId ?? "p1",
    playerName: "测试",
    gender: partial.gender ?? null,
    activeView: partial.activeView ?? "player",
    claimStatus: partial.claimStatus ?? "approved",
    isApproved: partial.isApproved ?? true,
    roles: partial.roles,
  };
}

async function testPassword() {
  const plain = "test-password-123";
  const stored = await hashPassword(plain);
  if (!stored.startsWith(`$argon2id$v=${PASSWORD_ALGO_VERSION}$`)) {
    fail("password hash missing version prefix");
  } else {
    pass("password hash has version prefix");
  }
  if (parsePasswordAlgoVersion(stored) !== PASSWORD_ALGO_VERSION) {
    fail("parsePasswordAlgoVersion mismatch");
  } else {
    pass("parsePasswordAlgoVersion ok");
  }
  if (!(await verifyPassword(plain, stored))) fail("verify correct password");
  else pass("verify correct password");
  if (await verifyPassword("wrong", stored)) fail("reject wrong password");
  else pass("reject wrong password");
}

function testEnrollmentToken() {
  const plain = generateEnrollmentCodePlain();
  const normalized = normalizeEnrollmentCodeInput(plain);
  const h = hashToken(normalized);
  if (!safeEqualToken(normalized, h)) fail("enrollment code hash verify");
  else pass("enrollment code hash verify");
  if (safeEqualToken("WRONG", h)) fail("reject wrong enrollment code");
  else pass("reject wrong enrollment code");
}

function testPolicyMatrix() {
  const captain = ctx({ roles: ["player", "captain"] });
  if (canViewTeamHealth(captain)) fail("captain cannot view team health");
  else pass("captain cannot view team health");

  const adminOnly = ctx({
    roles: ["admin"],
    playerId: null,
    isApproved: false,
    claimStatus: null,
  });
  if (canViewTeamHealth(adminOnly)) fail("admin-only cannot view health");
  else pass("admin-only cannot view health");
  if (!canManageAccounts(adminOnly)) fail("ops admin can manage accounts");
  else pass("ops admin can manage accounts");
  if (canWriteOwnHealthData(adminOnly)) fail("ops admin cannot write health");
  else pass("ops admin cannot write health");
  if (canViewSchedule(adminOnly)) fail("ops admin cannot view schedule");
  else pass("ops admin cannot view schedule");

  const pendingPlayerAdmin = ctx({
    roles: ["player", "admin"],
    playerId: null,
    isApproved: false,
    claimStatus: "pending",
  });
  if (!canManageAccounts(pendingPlayerAdmin)) {
    fail("pending with admin role can still open account admin");
  } else pass("pending with admin role can still open account admin");

  const playerAdmin = ctx({ roles: ["player", "admin"] });
  if (canManageAccounts(playerAdmin)) pass("rostered admin can manage accounts");
  else fail("rostered admin can manage accounts");

  const coachAdmin = ctx({ roles: ["player", "coach", "admin"] });
  if (!canViewTeamHealth(coachAdmin)) fail("coach+admin can view health");
  else pass("coach+admin can view health");

  const player = ctx({ roles: ["player"] });
  if (canArchiveTestSession(player)) fail("player cannot archive");
  else pass("player cannot archive");
  if (canCreateTestDayDraft(player)) fail("player cannot create collab draft");
  else pass("player cannot create collab draft");
  if (!canJoinTestDayDraft(player)) fail("approved player can join collab draft");
  else pass("approved player can join collab draft");
  if (
    canMutateTestDayDraftStructure(player, "other-account")
  ) {
    fail("player cannot mutate others' draft structure");
  } else pass("player cannot mutate others' draft structure");
  if (!canMutateTestDayDraftStructure(player, "a1")) {
    fail("creator can mutate own draft structure");
  } else pass("creator can mutate own draft structure");
  if (!canCreateTestDayDraft(ctx({ roles: ["player", "captain"] }))) {
    fail("captain can create collab draft");
  } else pass("captain can create collab draft");
  if (!canArchiveTestSession(ctx({ roles: ["player", "captain"] }))) {
    fail("captain can archive");
  } else pass("captain can archive");
  if (
    canArchiveTestSessionFromUser({
      accountId: "a1",
      username: "u1",
      teamId: "t1",
      teamTimeZone: "Asia/Shanghai",
      playerId: "p1",
      playerName: "测试",
      gender: null,
      roles: ["player"],
      activeView: "player",
      claimStatus: "approved",
    })
  ) {
    fail("player user cannot archive from client helper");
  } else pass("player user cannot archive from client helper");
  if (
    !canArchiveTestSessionFromUser({
      accountId: "a1",
      username: "u1",
      teamId: "t1",
      teamTimeZone: "Asia/Shanghai",
      playerId: "p1",
      playerName: "测试",
      gender: null,
      roles: ["player", "captain"],
      activeView: "captain",
      claimStatus: "approved",
    })
  ) {
    fail("captain user can archive from client helper");
  } else pass("captain user can archive from client helper");

  const pending = ctx({
    roles: ["player"],
    isApproved: false,
    claimStatus: "pending",
    playerId: null,
  });
  if (canWriteOwnHealthData(pending)) fail("pending cannot write health");
  else pass("pending cannot write health");

  if (!canViewTeamOps(ctx({ roles: ["player", "captain"] }))) {
    fail("captain can view team ops");
  } else pass("captain can view team ops");

  const pendingCaptain = ctx({
    roles: ["player", "captain"],
    isApproved: false,
    claimStatus: "pending",
    playerId: null,
  });
  if (canViewTeamOps(pendingCaptain)) fail("pending captain cannot view team ops");
  else pass("pending captain cannot view team ops");

  const pendingCoach = ctx({
    roles: ["player", "coach"],
    isApproved: false,
    claimStatus: "pending",
    playerId: null,
  });
  if (canViewTeamHealth(pendingCoach)) fail("pending coach cannot view team health");
  else pass("pending coach cannot view team health");

  if (canManageSeason(pendingCaptain)) fail("pending captain cannot manage season");
  else pass("pending captain cannot manage season");
  if (!canManageSeason(captain)) fail("captain can manage season");
  else pass("captain can manage season");
  if (canManageSeason(player)) fail("player cannot manage season");
  else pass("player cannot manage season");
  if (!canViewSchedule(player)) fail("approved player can view schedule");
  else pass("approved player can view schedule");
  if (canViewTeamSeasonReports(captain)) fail("captain cannot view team season reports");
  else pass("captain cannot view team season reports");
  if (!canViewTeamSeasonReports(ctx({ roles: ["player", "coach"] }))) {
    fail("coach can view team season reports");
  } else pass("coach can view team season reports");

  if (!coachHealthFieldAllowed("feedback_note")) pass("coach excludes feedback note");
  else fail("coach excludes feedback note");
  if (!coachHealthFieldAllowed("injury_note")) pass("coach excludes injury note");
  else fail("coach excludes injury note");
  if (!coachHealthFieldAllowed("cycle_raw")) pass("coach excludes cycle raw");
  else fail("coach excludes cycle raw");
  if (coachHealthFieldAllowed("rpe")) pass("coach includes rpe");
  else fail("coach includes rpe");
  if (canViewTestDayDraftSnapshot(true)) pass("draft members can view snapshot");
  else fail("draft members can view snapshot");
  if (canViewTestDayDraftSnapshot(false)) fail("non-members cannot view snapshot");
  else pass("non-members cannot view snapshot");
}

function testPublicOrigin() {
  const local = resolvePublicAppOrigin({ NODE_ENV: "development" });
  if (local.ok && local.origin === "http://localhost:3000") {
    pass("dev origin defaults to localhost");
  } else fail("dev origin defaults to localhost");

  const prodMissing = resolvePublicAppOrigin({ NODE_ENV: "production" });
  if (!prodMissing.ok) pass("production requires NEXT_PUBLIC_APP_URL");
  else fail("production requires NEXT_PUBLIC_APP_URL");

  const prodOk = resolvePublicAppOrigin({
    NODE_ENV: "production",
    NEXT_PUBLIC_APP_URL: "https://softball.example.com/app",
  });
  if (prodOk.ok && prodOk.origin === "https://softball.example.com") {
    pass("NEXT_PUBLIC_APP_URL origin stripped to host");
  } else fail("NEXT_PUBLIC_APP_URL origin stripped to host");
}

function testRateLimitAndCoachDto() {
  const windowMs = 60_000;
  const now = 1_000_000;
  const fresh = nextRateLimitState({
    nowMs: now,
    existing: null,
    max: 5,
    windowMs,
  });
  if (fresh.allowed && fresh.count === 1) pass("rate limit first hit allowed");
  else fail("rate limit first hit allowed");

  const expired = nextRateLimitState({
    nowMs: now,
    existing: { count: 5, windowEndMs: now - 1 },
    max: 5,
    windowMs,
  });
  if (expired.allowed && expired.count === 1) pass("rate limit expired window resets");
  else fail("rate limit expired window resets");

  const full = nextRateLimitState({
    nowMs: now,
    existing: { count: 5, windowEndMs: now + windowMs },
    max: 5,
    windowMs,
  });
  if (!full.allowed && full.count === 5) pass("rate limit at max denied without increment");
  else fail("rate limit at max denied without increment");

  const bump = nextRateLimitState({
    nowMs: now,
    existing: { count: 4, windowEndMs: now + windowMs },
    max: 5,
    windowMs,
  });
  if (bump.allowed && bump.count === 5) pass("rate limit below max increments");
  else fail("rate limit below max increments");

  const leak = findForbiddenCoachDtoKey({
    plotted: [],
    periodStartDates: ["2011-07-13"],
  });
  if (leak === "periodStartDates") pass("coach dto guard catches periodStartDates");
  else fail("coach dto guard catches periodStartDates");

  const clean = findForbiddenCoachDtoKey({
    plotted: [{ playerId: "p1", quadrant: "peak" }],
    loadNotes: [{ physiologicalLoadLabel: "低" }],
  });
  if (clean === null) pass("coach dto guard allows load tag");
  else fail("coach dto guard allows load tag");

  const guest = buildGuestDraftDto({
    draft: {
      id: "d1",
      date: new Date("2026-08-23T12:00:00.000Z"),
      status: "open",
      version: 2,
      createdByAccountId: "a1",
    },
  });
  if (
    !guest.isMember &&
    guest.conflicts.length === 0 &&
    guest.snapshot.hits.length === 0 &&
    guest.snapshot.assignmentLog.length === 0
  ) {
    pass("guest draft dto has no scores");
  } else fail("guest draft dto has no scores");
}

function testTeamTodayBoundary() {
  const shanghaiMidnight = new Date("2026-08-21T16:00:00.000Z");
  if (getTodayDateStr(shanghaiMidnight) === "2026-08-21") {
    pass("UTC calendar of 16:00Z is Aug 21");
  } else fail("UTC calendar of 16:00Z is Aug 21");
  if (getTeamTodayDateStr("Asia/Shanghai", shanghaiMidnight) === "2026-08-22") {
    pass("Shanghai natural day of 16:00Z is Aug 22");
  } else fail("Shanghai natural day of 16:00Z is Aug 22");
  if (
    isTeamTodayDateOnly("2026-08-22", "Asia/Shanghai", shanghaiMidnight) &&
    !isTeamTodayDateOnly("2026-08-21", "Asia/Shanghai", shanghaiMidnight)
  ) {
    pass("Shanghai today-only uses team date not UTC");
  } else fail("Shanghai today-only uses team date not UTC");
  if (
    rejectIfNotToday("2026-08-21", "Asia/Shanghai", shanghaiMidnight) !== null
  ) {
    pass("reject UTC yesterday at Shanghai 00:00");
  } else fail("reject UTC yesterday at Shanghai 00:00");
  if (
    rejectIfNotToday("2026-08-22", "Asia/Shanghai", shanghaiMidnight) === null
  ) {
    pass("allow Shanghai today at 00:00");
  } else fail("allow Shanghai today at 00:00");

  if (
    isWithinTestDayArchiveWindow(
      "2026-08-22",
      "Asia/Shanghai",
      shanghaiMidnight
    ) &&
    isWithinTestDayArchiveWindow(
      "2026-08-21",
      "Asia/Shanghai",
      shanghaiMidnight
    ) &&
    !isWithinTestDayArchiveWindow(
      "2026-08-20",
      "Asia/Shanghai",
      shanghaiMidnight
    )
  ) {
    pass("test-day archive window is today or next-day makeup");
  } else fail("test-day archive window is today or next-day makeup");

  const laEvening = new Date("2026-08-22T06:30:00.000Z");
  if (getTodayDateStr(laEvening) === "2026-08-22") {
    pass("UTC calendar of 06:30Z is Aug 22");
  } else fail("UTC calendar of 06:30Z is Aug 22");
  if (getTeamTodayDateStr("America/Los_Angeles", laEvening) === "2026-08-21") {
    pass("LA natural day of 06:30Z is Aug 21");
  } else fail("LA natural day of 06:30Z is Aug 21");
}

async function main() {
  await testPassword();
  testEnrollmentToken();
  testPolicyMatrix();
  testPublicOrigin();
  testRateLimitAndCoachDto();
  testTeamTodayBoundary();

  const failed = findings.filter((f) => f.level === "fail").length;
  console.log(`\n${findings.length} checks, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
