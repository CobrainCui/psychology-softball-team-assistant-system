/**
 * 真实 Action / API / session 权限回归（写测试库并清理）
 * npm run verify:auth-actions
 * 必须配置独立 TEST_DATABASE_URL，见 scripts/loadTestDb.ts。
 */
import "./loadTestDb";
import { prisma } from "../lib/db";
import { getOrCreateDefaultTeam } from "../lib/team";
import { hashPassword } from "../lib/auth/password";
import {
  createSession,
  getSessionFromToken,
} from "../lib/auth/session";
import {
  disableAuthVerifyHarness,
  enableAuthVerifyHarness,
  setHarnessClientIp,
  setHarnessSessionToken,
} from "../lib/auth/request";
import {
  generateEnrollmentCodePlain,
  hashToken,
  normalizeEnrollmentCodeInput,
} from "../lib/auth/tokens";
import { saveReadinessAssessment } from "../lib/status/readinessActions";
import { saveSessionFeedback } from "../lib/status/feedbackActions";
import { getCycleProfile } from "../lib/cycleActions";
import { getInjuryCases } from "../lib/status/injuryActions";
import {
  getCoachDaySummary,
  getTeamOpsSummary,
} from "../lib/status/coachActions";
import { getPlayerProfileData } from "../lib/status/profileActions";
import { saveTestSession } from "../lib/actions";
import { registerWithEnrollmentCode } from "../lib/auth/enrollActions";
import { approveMembershipClaim, rejectMembershipClaim } from "../lib/auth/claimActions";
import { grantRole } from "../lib/auth/roleActions";
import { listAccountsForAdmin } from "../lib/auth/adminActions";
import {
  consumePasswordResetToken,
  createPasswordResetLink,
} from "../lib/auth/resetActions";
import { changePassword } from "../lib/auth/authActions";
import {
  createInjuryCase,
  addInjuryPainLog,
  addInjuryNote,
} from "../lib/status/injuryActions";
import { GET as getPlayersApi, POST as postPlayersApi } from "../app/api/players/route";
import { PATCH as patchPlayerApi } from "../app/api/players/[id]/route";
import { GET as getSessionsApi, POST as postSessionsApi } from "../app/api/sessions/route";
import { getTodayDateStr } from "../lib/dateOnly";
import type { RoleKind } from "../lib/auth/types";

const findings: { level: "pass" | "fail"; msg: string }[] = [];

function pass(msg: string) {
  findings.push({ level: "pass", msg });
  console.log("PASS", msg);
}
function fail(msg: string) {
  findings.push({ level: "fail", msg });
  console.error("FAIL", msg);
}

const runId = `va${Date.now().toString(36)}`;
const PASSWORD = "verify-pass-1";

type Seeded = {
  accountId: string;
  playerId: string | null;
  token: string;
  username: string;
};

async function seedAccount(input: {
  teamId: string;
  username: string;
  roles: RoleKind[];
  claim: "pending" | "approved" | "none";
  displayName: string;
}): Promise<Seeded> {
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

  if (input.claim !== "none") {
    await prisma.membershipClaim.create({
      data: {
        accountId: account.id,
        status: input.claim,
        displayName: input.displayName,
        playerId: player?.id ?? null,
        reviewedAt: input.claim === "approved" ? new Date() : null,
      },
    });
  }

  const token = await createSession(account.id);
  return {
    accountId: account.id,
    playerId: player?.id ?? null,
    token,
    username: input.username,
  };
}

async function asUser(token: string | undefined) {
  setHarnessSessionToken(token);
}

function jsonRequest(url: string, method: string, body?: unknown): Request {
  return new Request(url, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function cleanup(usernames: string[], playerNames: string[]) {
  const accounts = await prisma.account.findMany({
    where: { username: { in: usernames } },
    select: { id: true, playerId: true },
  });
  const accountIds = accounts.map((a) => a.id);
  if (accountIds.length > 0) {
    await prisma.authSession.deleteMany({
      where: { accountId: { in: accountIds } },
    });
    await prisma.passwordResetToken.deleteMany({
      where: { accountId: { in: accountIds } },
    });
    await prisma.enrollmentCode.deleteMany({
      where: { usedByAccountId: { in: accountIds } },
    });
    await prisma.account.deleteMany({ where: { id: { in: accountIds } } });
  }
  const extraPlayers = await prisma.player.findMany({
    where: { name: { in: playerNames } },
    select: { id: true },
  });
  const playerIds = extraPlayers.map((p) => p.id);
  if (playerIds.length > 0) {
    const hits = await prisma.hit.findMany({
      where: { playerId: { in: playerIds } },
      select: { sessionId: true },
    });
    const sessionIds = [...new Set(hits.map((h) => h.sessionId))];
    if (sessionIds.length > 0) {
      await prisma.testSession.deleteMany({ where: { id: { in: sessionIds } } });
    }
    await prisma.readinessCheck.deleteMany({
      where: { playerId: { in: playerIds } },
    });
    await prisma.sessionFeedback.deleteMany({
      where: { playerId: { in: playerIds } },
    });
    await prisma.injuryCase.deleteMany({
      where: { playerId: { in: playerIds } },
    });
    await prisma.player.deleteMany({ where: { id: { in: playerIds } } });
  }
  await prisma.enrollmentCode.deleteMany({
    where: { revokedNote: runId },
  });
}

async function main() {
  enableAuthVerifyHarness();
  setHarnessClientIp(`verify-${runId}`);
  const usernames: string[] = [];
  const playerNames: string[] = [];
  try {
    const team = await getOrCreateDefaultTeam();

    const pending = await seedAccount({
      teamId: team.id,
      username: `${runId}_pend`,
      roles: ["player"],
      claim: "pending",
      displayName: `${runId}_pend`,
    });
    const pendingCoach = await seedAccount({
      teamId: team.id,
      username: `${runId}_pc`,
      roles: ["player", "coach"],
      claim: "pending",
      displayName: `${runId}_pc`,
    });
    const raceClaim = await seedAccount({
      teamId: team.id,
      username: `${runId}_race`,
      roles: ["player"],
      claim: "pending",
      displayName: `${runId}_race`,
    });
    const player = await seedAccount({
      teamId: team.id,
      username: `${runId}_pl`,
      roles: ["player"],
      claim: "approved",
      displayName: `${runId}_pl`,
    });
    const captain = await seedAccount({
      teamId: team.id,
      username: `${runId}_cap`,
      roles: ["player", "captain"],
      claim: "approved",
      displayName: `${runId}_cap`,
    });
    const coach = await seedAccount({
      teamId: team.id,
      username: `${runId}_co`,
      roles: ["player", "coach"],
      claim: "approved",
      displayName: `${runId}_co`,
    });
    const admin = await seedAccount({
      teamId: team.id,
      username: `${runId}_ad`,
      roles: ["admin"],
      claim: "none",
      displayName: `${runId}_ad`,
    });
    usernames.push(
      pending.username,
      pendingCoach.username,
      raceClaim.username,
      player.username,
      captain.username,
      coach.username,
      admin.username
    );
    playerNames.push(
      `${runId}_pend`,
      `${runId}_pc`,
      `${runId}_race`,
      `${runId}_racep`,
      `${runId}_pl`,
      `${runId}_cap`,
      `${runId}_co`
    );

    await asUser(undefined);
    const unauth = await saveReadinessAssessment({
      date: "2026-01-01",
      sleep: 3,
      stress: 3,
      fatigue: 3,
      soreness: 3,
      willingness: 3,
      physicalBattery: 3,
      mentalDrive: 3,
      quadrant: "slack",
    });
    if (!unauth.success) pass("unauthenticated write denied");
    else fail("unauthenticated write denied");

    const anonPlayers = await getPlayersApi();
    if (anonPlayers.status === 401) pass("GET /api/players anonymous 401");
    else fail(`GET /api/players anonymous 401 (got ${anonPlayers.status})`);

    const anonSessions = await getSessionsApi();
    if (anonSessions.status === 401) pass("GET /api/sessions anonymous 401");
    else fail(`GET /api/sessions anonymous 401 (got ${anonSessions.status})`);

    const anonPostPlayers = await postPlayersApi(
      jsonRequest("http://local/api/players", "POST", { name: `${runId}_x` })
    );
    if (anonPostPlayers.status === 401) pass("POST /api/players anonymous 401");
    else fail(`POST /api/players anonymous 401 (got ${anonPostPlayers.status})`);

    const anonPatch = await patchPlayerApi(
      jsonRequest("http://local/api/players/x", "PATCH", { name: "n" }),
      { params: Promise.resolve({ id: "x" }) }
    );
    if (anonPatch.status === 401) pass("PATCH /api/players/[id] anonymous 401");
    else fail(`PATCH /api/players/[id] anonymous 401 (got ${anonPatch.status})`);

    const anonPostSessions = await postSessionsApi(
      jsonRequest("http://local/api/sessions", "POST", {
        hits: [],
        speedRecords: [],
      })
    );
    if (anonPostSessions.status === 401) pass("POST /api/sessions anonymous 401");
    else fail(`POST /api/sessions anonymous 401 (got ${anonPostSessions.status})`);

    await asUser(pending.token);
    const pendingWrite = await saveReadinessAssessment({
      date: "2026-01-01",
      sleep: 3,
      stress: 3,
      fatigue: 3,
      soreness: 3,
      willingness: 3,
      physicalBattery: 3,
      mentalDrive: 3,
      quadrant: "slack",
    });
    if (!pendingWrite.success) pass("pending cannot write health");
    else fail("pending cannot write health");

    const pendingPost = await postPlayersApi(
      jsonRequest("http://local/api/players", "POST", { name: `${runId}_pendx` })
    );
    if (pendingPost.status === 403) pass("pending POST /api/players 403");
    else fail(`pending POST /api/players 403 (got ${pendingPost.status})`);

    await asUser(admin.token);
    const grantPending = await grantRole(pending.accountId, "coach");
    if (!grantPending.success) pass("cannot grant elevated role to pending");
    else fail("cannot grant elevated role to pending");
    const grantPendingAdmin = await grantRole(pending.accountId, "admin");
    if (!grantPendingAdmin.success) pass("cannot grant admin to pending");
    else fail("cannot grant admin to pending");
    const adminList = await listAccountsForAdmin();
    if (adminList.success) pass("ops admin can list accounts");
    else fail(`ops admin can list accounts (${adminList.success === false ? adminList.error : ""})`);

    await asUser(pendingCoach.token);
    const pendingCoachHealth = await getCoachDaySummary();
    if (!pendingCoachHealth.success) pass("pending coach denied health summary");
    else fail("pending coach denied health summary");

    await asUser(player.token);
    const backdated = await saveReadinessAssessment({
      date: "2000-01-01",
      sleep: 3,
      stress: 3,
      fatigue: 3,
      soreness: 3,
      willingness: 3,
      physicalBattery: 3,
      mentalDrive: 3,
      quadrant: "slack",
    });
    if (!backdated.success) pass("player cannot backdate readiness");
    else fail("player cannot backdate readiness");

    const secretNote = `SECRET_NOTE_${runId}`;
    const today = getTodayDateStr();
    const fb = await saveSessionFeedback({
      date: today,
      activityTypes: ["batting"],
      sessionRpe: 5,
      note: secretNote,
    });
    if (fb.success) pass("player can write own feedback today");
    else fail(`player can write own feedback today (${fb.success === false ? fb.error : ""})`);

    const ownCycle = await getCycleProfile();
    if (ownCycle.success) pass("player can read own cycle");
    else fail("player can read own cycle");

    const ownInjury = await getInjuryCases();
    if (ownInjury.success) pass("player can read own injury");
    else fail("player can read own injury");

    const backdatedCase = await createInjuryCase({
      painArea: "knee",
      injuryKind: "overuse",
      startDate: "2000-01-01",
      painScore: 3,
      painExerciseRelations: [],
    });
    if (!backdatedCase.success) pass("cannot backdate injury case");
    else fail("cannot backdate injury case");

    const todayCase = await createInjuryCase({
      painArea: "knee",
      injuryKind: "overuse",
      startDate: today,
      painScore: 3,
      painExerciseRelations: [],
    });
    if (todayCase.success) pass("player can create injury today");
    else fail(`player can create injury today (${todayCase.success === false ? todayCase.error : ""})`);

    if (todayCase.success) {
      const backdatedLog = await addInjuryPainLog({
        caseId: todayCase.injuryCase.id,
        date: "2000-01-01",
        painScore: 4,
        painExerciseRelations: [],
      });
      if (!backdatedLog.success) pass("cannot backdate injury pain log");
      else fail("cannot backdate injury pain log");

      const backdatedNote = await addInjuryNote({
        caseId: todayCase.injuryCase.id,
        kind: "treatment",
        date: "2000-01-01",
        content: "历史备注",
      });
      if (!backdatedNote.success) pass("cannot backdate injury note");
      else fail("cannot backdate injury note");

      await asUser(captain.token);
      const hijackParent = await createInjuryCase({
        painArea: "knee",
        injuryKind: "overuse",
        startDate: today,
        painScore: 2,
        painExerciseRelations: [],
        parentCaseId: todayCase.injuryCase.id,
      });
      if (!hijackParent.success) pass("cannot attach another player's injury parent");
      else fail("cannot attach another player's injury parent");
      await asUser(player.token);
    }

    const ownProfile = await getPlayerProfileData();
    if (ownProfile.success) pass("player can read own profile");
    else fail("player can read own profile");

    if (!player.playerId || !captain.playerId) {
      fail("seeded player ids");
    } else {
      const patchOther = await patchPlayerApi(
        jsonRequest(`http://local/api/players/${captain.playerId}`, "PATCH", {
          name: `${runId}_hijack`,
        }),
        { params: Promise.resolve({ id: captain.playerId }) }
      );
      if (patchOther.status === 403) pass("player PATCH other 403");
      else fail(`player PATCH other 403 (got ${patchOther.status})`);

      const patchRole = await patchPlayerApi(
        jsonRequest(`http://local/api/players/${player.playerId}`, "PATCH", {
          role: "coach",
        }),
        { params: Promise.resolve({ id: player.playerId }) }
      );
      if (patchRole.status === 403) pass("player PATCH role field 403");
      else fail(`player PATCH role field 403 (got ${patchRole.status})`);

      const patchOwn = await patchPlayerApi(
        jsonRequest(`http://local/api/players/${player.playerId}`, "PATCH", {
          name: `${runId}_pl`,
        }),
        { params: Promise.resolve({ id: player.playerId }) }
      );
      if (patchOwn.status === 200) pass("player PATCH own 200");
      else fail(`player PATCH own 200 (got ${patchOwn.status})`);
    }

    const playerPostRoster = await postPlayersApi(
      jsonRequest("http://local/api/players", "POST", { name: `${runId}_deny` })
    );
    if (playerPostRoster.status === 403) pass("player POST /api/players 403");
    else fail(`player POST /api/players 403 (got ${playerPostRoster.status})`);

    const playerPostSessions = await postSessionsApi(
      jsonRequest("http://local/api/sessions", "POST", {
        hits: [],
        speedRecords: [],
      })
    );
    if (playerPostSessions.status === 403) pass("player POST /api/sessions 403");
    else fail(`player POST /api/sessions 403 (got ${playerPostSessions.status})`);

    const playerArchive = await saveTestSession({
      hits: [],
      speedRecords: [],
      speedColumns: [],
      speedMarks: [],
      flyCatchAttempts: [],
      strikeJudgeColumns: [],
      strikeJudgeCells: [],
      throwPlays: [],
      assignments: {},
      testItems: [],
    });
    if (!playerArchive.success) pass("player cannot archive");
    else fail("player cannot archive");

    const playerOps = await getTeamOpsSummary();
    if (!playerOps.success) pass("player denied team ops");
    else fail("player denied team ops");

    const playerCoach = await getCoachDaySummary();
    if (!playerCoach.success) pass("player denied coach summary");
    else fail("player denied coach summary");

    const changed = await changePassword({
      currentPassword: PASSWORD,
      newPassword: "changed-pass-99",
    });
    if (changed.success) {
      const stale = await getSessionFromToken(player.token);
      if (!stale) pass("password change revokes old session");
      else fail("password change revokes old session");
    } else {
      fail(`password change revokes old session (${changed.error})`);
    }

    await asUser(captain.token);
    const capCoach = await getCoachDaySummary();
    if (!capCoach.success) pass("captain denied coach health summary");
    else fail("captain denied coach health summary");

    const capOps = await getTeamOpsSummary();
    if (capOps.success) pass("captain can view team ops");
    else fail("captain can view team ops");

    const rosterName = `${runId}_api`;
    playerNames.push(rosterName);
    const capPostRoster = await postPlayersApi(
      jsonRequest("http://local/api/players", "POST", {
        name: rosterName,
        gender: "female",
      })
    );
    if (capPostRoster.status === 201) pass("captain POST /api/players 201");
    else fail(`captain POST /api/players 201 (got ${capPostRoster.status})`);

    const capEmptyArchive = await postSessionsApi(
      jsonRequest("http://local/api/sessions", "POST", {
        hits: [],
        speedRecords: [],
      })
    );
    if (capEmptyArchive.status === 400) pass("captain POST empty archive 400");
    else fail(`captain POST empty archive 400 (got ${capEmptyArchive.status})`);

    if (captain.playerId) {
      const capArchive = await postSessionsApi(
        jsonRequest("http://local/api/sessions", "POST", {
          hits: [
            {
              id: `h_${runId}`,
              result: "LD",
              playerId: captain.playerId,
              playerName: `${runId}_cap`,
              timestamp: 1,
            },
          ],
          speedRecords: [],
        })
      );
      if (capArchive.status === 201) pass("captain POST /api/sessions 201");
      else fail(`captain POST /api/sessions 201 (got ${capArchive.status})`);
    } else {
      fail("captain POST /api/sessions 201");
    }

    await asUser(admin.token);
    const adminHealth = await getCoachDaySummary();
    if (!adminHealth.success) pass("admin without coach denied health");
    else fail("admin without coach denied health");
    const adminWrite = await saveReadinessAssessment({
      date: getTodayDateStr(),
      sleep: 3,
      stress: 3,
      fatigue: 3,
      soreness: 3,
      willingness: 3,
      physicalBattery: 3,
      mentalDrive: 3,
      quadrant: "slack",
    });
    if (!adminWrite.success) pass("ops admin cannot write health");
    else fail("ops admin cannot write health");

    await asUser(coach.token);
    const coachSummary = await getCoachDaySummary();
    if (!coachSummary.success) {
      fail(`coach can read health summary (${coachSummary.error})`);
    } else {
      const raw = JSON.stringify(coachSummary.summary);
      if (raw.includes(secretNote)) fail("coach DTO excludes feedback note");
      else pass("coach DTO excludes feedback note");
      const hasNoteField = coachSummary.summary.sessionFeedbacks.some(
        (row) => "note" in row
      );
      if (hasNoteField) fail("coach feedback rows have no note field");
      else pass("coach feedback rows have no note field");
    }

    await asUser(undefined);
    const takenName = `${runId}_taken`;
    usernames.push(takenName);
    await prisma.account.create({
      data: {
        teamId: team.id,
        username: takenName,
        passwordHash: await hashPassword(PASSWORD),
      },
    });

    const plainCode = generateEnrollmentCodePlain();
    const codeRow = await prisma.enrollmentCode.create({
      data: {
        teamId: team.id,
        codeHash: hashToken(normalizeEnrollmentCodeInput(plainCode)),
        expiresAt: new Date(Date.now() + 86400000),
        revokedNote: runId,
      },
    });

    const conflict = await registerWithEnrollmentCode({
      code: plainCode,
      username: takenName,
      password: PASSWORD,
      displayName: `${runId}_x`,
    });
    const stillActive = await prisma.enrollmentCode.findUnique({
      where: { id: codeRow.id },
    });
    if (!conflict.success && stillActive?.status === "active") {
      pass("username conflict does not consume code");
    } else {
      fail("username conflict does not consume code");
    }

    const badCode = await registerWithEnrollmentCode({
      code: "ZZZZ-ZZZZ-ZZZZ-ZZZZ",
      username: `${runId}_new1`,
      password: PASSWORD,
      displayName: `${runId}_new1`,
    });
    const phantom = await prisma.account.findUnique({
      where: { username: `${runId}_new1` },
    });
    if (!badCode.success && !phantom) pass("invalid code does not create account");
    else fail("invalid code does not create account");

    const enrolledName = `${runId}_new`;
    playerNames.push(`${runId}_new`);
    usernames.push(enrolledName);
    const enrolled = await registerWithEnrollmentCode({
      code: plainCode,
      username: enrolledName,
      password: PASSWORD,
      displayName: `${runId}_new`,
    });
    const used = await prisma.enrollmentCode.findUnique({
      where: { id: codeRow.id },
    });
    if (enrolled.success && used?.status === "used") {
      pass("register consumes code in same transaction");
    } else {
      fail("register consumes code in same transaction");
    }

    await asUser(admin.token);
    const raceRow = await prisma.membershipClaim.findUnique({
      where: { accountId: raceClaim.accountId },
    });
    if (raceRow) {
      const [approvedRace, rejectedRace] = await Promise.all([
        approveMembershipClaim({
          claimId: raceRow.id,
          newPlayerName: `${runId}_racep`,
        }),
        rejectMembershipClaim(raceRow.id),
      ]);
      const raceWins = [approvedRace, rejectedRace].filter((r) => r.success).length;
      if (raceWins === 1) pass("claim approve/reject is atomic");
      else fail(`claim approve/reject is atomic (wins=${raceWins})`);
      const raced = await prisma.membershipClaim.findUnique({
        where: { id: raceRow.id },
      });
      if (raced && raced.status !== "pending") {
        pass("claim ends in terminal status");
      } else fail("claim ends in terminal status");
    } else {
      fail("claim approve/reject is atomic");
      fail("claim ends in terminal status");
    }

    if (enrolled.success) {
      const claim = await prisma.membershipClaim.findUnique({
        where: { accountId: enrolled.accountId },
      });
      if (claim) {
        const approved = await approveMembershipClaim({
          claimId: claim.id,
          newPlayerName: `${runId}_new`,
        });
        if (approved.success) pass("admin can approve membership claim");
        else fail(`admin can approve membership claim (${approved.error})`);
      } else {
        fail("admin can approve membership claim");
      }
    }

    const firstLink = await createPasswordResetLink(player.accountId);
    const secondLink = await createPasswordResetLink(player.accountId);
    if (firstLink.success && secondLink.success) {
      const oldConsume = await consumePasswordResetToken(
        firstLink.token,
        "new-password-99"
      );
      if (!oldConsume.success) pass("old reset link invalidated by newer link");
      else fail("old reset link invalidated by newer link");
      const [a, b] = await Promise.all([
        consumePasswordResetToken(secondLink.token, "new-password-11"),
        consumePasswordResetToken(secondLink.token, "new-password-22"),
      ]);
      const wins = [a, b].filter((r) => r.success).length;
      if (wins === 1) pass("concurrent reset consume is atomic");
      else fail(`concurrent reset consume is atomic (wins=${wins})`);
    } else {
      fail("old reset link invalidated by newer link");
      fail("concurrent reset consume is atomic");
    }

    const disabledToken = await createSession(captain.accountId);
    await prisma.account.update({
      where: { id: captain.accountId },
      data: { status: "disabled" },
    });
    const disabledCtx = await getSessionFromToken(disabledToken);
    if (!disabledCtx) pass("disabled account session rejected");
    else fail("disabled account session rejected");
  } catch (error) {
    console.error(error);
    fail(`script threw: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    try {
      await cleanup(usernames, playerNames);
    } catch (error) {
      console.error("cleanup failed:", error);
    }
    disableAuthVerifyHarness();
  }

  const failed = findings.filter((f) => f.level === "fail").length;
  console.log(`\n${findings.length} checks, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
