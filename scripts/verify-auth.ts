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
} from "../lib/auth/policy";
import { resolvePublicAppOrigin } from "../lib/auth/publicOrigin";

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
  if (coachHealthFieldAllowed("rpe")) pass("coach includes rpe");
  else fail("coach includes rpe");
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

async function main() {
  await testPassword();
  testEnrollmentToken();
  testPolicyMatrix();
  testPublicOrigin();

  const failed = findings.filter((f) => f.level === "fail").length;
  console.log(`\n${findings.length} checks, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
