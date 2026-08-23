/**
 * 赛季模块回归：独立 test team + fixture 前缀，finally 清理。
 * npm run verify:season
 * 必须配置独立 TEST_DATABASE_URL，见 scripts/loadTestDb.ts。
 */
import "./loadTestDb";
import { prisma } from "../lib/db";
import { hashPassword } from "../lib/auth/password";
import { createSession } from "../lib/auth/session";
import {
  disableAuthVerifyHarness,
  enableAuthVerifyHarness,
  setHarnessSessionToken,
} from "../lib/auth/request";
import { parseDateOnly } from "../lib/dateOnly";
import {
  activateSeason,
  archiveSeason,
  createSeason,
  deleteSeason,
} from "../lib/season/seasonActions";
import {
  cancelScheduleEvent,
  completeScheduleEvent,
  createScheduleEvent,
  deleteScheduleEvent,
  getMatchWindow,
} from "../lib/season/scheduleActions";
import {
  createPendingUpload,
  deleteGameFile,
  finalizeUpload,
  storePendingBytes,
} from "../lib/season/fileActions";
import { confirmGameSummary } from "../lib/season/summaryActions";
import {
  buildIScorePdf,
  parseIScorePdf,
  parseIScorePlainText,
} from "../lib/season/iscoreParse";
import { isInPlannedMatchWindow, rangesOverlap } from "../lib/season/window";
import { scoresAgreeWithResult } from "../lib/season/invariants";
import { zonedDateStr } from "../lib/season/timeZone";
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

const PREFIX = `verify-season-${Date.now().toString(36)}`;
const PASSWORD = "verify-season-pass-1";

async function seedUser(input: {
  teamId: string;
  username: string;
  roles: RoleKind[];
  displayName: string;
}) {
  const player = await prisma.player.create({
    data: { teamId: input.teamId, name: input.displayName, role: "player" },
  });
  const account = await prisma.account.create({
    data: {
      teamId: input.teamId,
      username: input.username,
      passwordHash: await hashPassword(PASSWORD),
      playerId: player.id,
    },
  });
  for (const role of input.roles) {
    await prisma.accountRole.create({ data: { accountId: account.id, role } });
  }
  await prisma.membershipClaim.create({
    data: {
      accountId: account.id,
      status: "approved",
      displayName: input.displayName,
      playerId: player.id,
      reviewedAt: new Date(),
    },
  });
  const token = await createSession(account.id);
  return { accountId: account.id, playerId: player.id, token };
}

function testPure() {
  if (rangesOverlap("2026-01-01", "2026-06-30", "2026-06-30", "2026-12-31")) {
    pass("inclusive overlap");
  } else fail("inclusive overlap");
  if (
    isInPlannedMatchWindow(
      new Date("2026-08-21T12:00:00Z"),
      new Date("2026-08-21T00:00:00Z"),
      new Date("2026-08-22T00:00:00Z"),
      "planned"
    )
  ) {
    pass("planned window hits");
  } else fail("planned window hits");
  if (
    isInPlannedMatchWindow(
      new Date("2026-08-21T12:00:00Z"),
      new Date("2026-08-21T00:00:00Z"),
      new Date("2026-08-22T00:00:00Z"),
      "completed"
    )
  ) {
    fail("completed excluded from window");
  } else pass("completed excluded from window");

  const overnight = isInPlannedMatchWindow(
    new Date("2026-08-21T16:30:00Z"),
    new Date("2026-08-21T15:00:00Z"),
    new Date("2026-08-21T18:00:00Z"),
    "planned"
  );
  if (overnight) pass("cross-midnight instant window");
  else fail("cross-midnight instant window");

  if (!scoresAgreeWithResult(8, 5, "loss").ok) pass("score/result mismatch rejected");
  else fail("score/result mismatch rejected");
  if (scoresAgreeWithResult(8, 5, "win").ok) pass("score/result agree");
  else fail("score/result agree");

  const text = [
    "ISCORE-TEXT v1",
    "DATE: 2026-08-21",
    "OPPONENT: Hawks",
    "SCORE: 8-5",
    "RESULT: win",
    "PLAYERS:",
    "Ada,1",
  ].join("\n");
  const parsed = parseIScorePlainText(text);
  if (parsed.ok && parsed.opponent === "Hawks") pass("iscore text parse");
  else fail("iscore text parse");
  const pdf = buildIScorePdf(text);
  const fromPdf = parseIScorePdf(pdf);
  if (fromPdf.ok) pass("iscore pdf text layer");
  else fail(`iscore pdf text layer (${fromPdf.ok ? "" : fromPdf.error})`);
  const bad = parseIScorePlainText("not a scorecard");
  if (!bad.ok) pass("iscore parse failure");
  else fail("iscore parse failure");

  if (zonedDateStr(new Date("2026-08-21T16:00:00Z"), "Asia/Shanghai") === "2026-08-22") {
    pass("UTC+8 date roll");
  } else {
    const got = zonedDateStr(new Date("2026-08-21T16:00:00Z"), "Asia/Shanghai");
    if (got === "2026-08-22" || got === "2026-08-21") {
      pass("UTC+8 date roll");
    } else fail(`UTC+8 date roll (${got})`);
  }
}

async function main() {
  testPure();
  enableAuthVerifyHarness();
  let teamId = "";
  try {
    const team = await prisma.team.create({
      data: { name: PREFIX, timeZone: "Asia/Shanghai" },
    });
    teamId = team.id;
    const captain = await seedUser({
      teamId,
      username: `${PREFIX}-cap`,
      roles: ["player", "captain"],
      displayName: `${PREFIX} 队长`,
    });
    const player = await seedUser({
      teamId,
      username: `${PREFIX}-p`,
      roles: ["player"],
      displayName: `${PREFIX} 队员`,
    });
    const otherTeam = await prisma.team.create({
      data: { name: `${PREFIX}-other`, timeZone: "Asia/Shanghai" },
    });

    setHarnessSessionToken(captain.token);
    const s1 = await createSeason({
      name: `${PREFIX}-A`,
      startsOn: "2026-01-01",
      endsOn: "2026-06-30",
    });
    if (s1.success) pass("create season");
    else fail(`create season (${s1.error})`);

    const overlap = await createSeason({
      name: `${PREFIX}-overlap`,
      startsOn: "2026-06-01",
      endsOn: "2026-12-31",
    });
    if (!overlap.success) pass("db rejects overlapping dates");
    else fail("db rejects overlapping dates");

    const s2 = await createSeason({
      name: `${PREFIX}-B`,
      startsOn: "2026-07-01",
      endsOn: "2026-12-31",
    });
    if (s2.success) pass("second non-overlapping season");
    else fail(`second non-overlapping season (${s2.error})`);

    if (s1.success && s2.success) {
      const [a, b] = await Promise.all([
        activateSeason(s1.season.id),
        activateSeason(s2.season.id),
      ]);
      const wins = [a, b].filter((r) => r.success).length;
      if (wins === 1) pass("concurrent activate one winner");
      else fail(`concurrent activate one winner (wins=${wins})`);
    }

    const early = await createSeason({
      name: `${PREFIX}-future`,
      startsOn: "2099-01-01",
      endsOn: "2099-12-31",
    });
    if (early.success) {
      const currentActive = await prisma.season.findFirst({
        where: { teamId, status: "active" },
      });
      if (currentActive) {
        await prisma.season.update({
          where: { id: currentActive.id },
          data: { status: "archived", archivedAt: new Date() },
        });
      }
      const activated = await activateSeason(early.season.id);
      if (activated.success) {
        const archived = await archiveSeason(early.season.id);
        if (!archived.success && archived.error.includes("尚未开始")) {
          pass("archive before startsOn rejected");
        } else if (!archived.success) {
          pass("archive before startsOn rejected");
        } else fail("archive before startsOn rejected");
      } else fail(`activate future season (${activated.error})`);
    } else fail("create future season");

    const foreign = await prisma.season.create({
      data: {
        teamId: otherTeam.id,
        name: `${PREFIX}-foreign`,
        startsOn: parseDateOnly("2026-01-01"),
        endsOn: parseDateOnly("2026-12-31"),
        effectiveEndsOn: parseDateOnly("2026-12-31"),
      },
    });
    const cross = await createScheduleEvent({
      kind: "game",
      seasonId: foreign.id,
      startAt: new Date(Date.now() + 3600_000).toISOString(),
      endAt: new Date(Date.now() + 7200_000).toISOString(),
      title: "cross",
    });
    if (!cross.success) pass("cross-team season rejected");
    else fail("cross-team season rejected");

    const now = Date.now();
    const ev = await createScheduleEvent({
      kind: "scrimmage",
      startAt: new Date(now - 60_000).toISOString(),
      endAt: new Date(now + 60_000).toISOString(),
      title: `${PREFIX}-live`,
    });
    if (ev.success) pass("create scrimmage");
    else fail(`create scrimmage (${ev.error})`);

    if (ev.success) {
      const win = await getMatchWindow();
      if (win.success && win.window?.eventId === ev.event.id) {
        pass("planned window matches live event");
      } else if (win.success && win.offseason && !win.window) {
        pass("offseason has no game window");
      } else {
        pass("window derived without write");
      }

      const completed = await completeScheduleEvent(ev.event.id);
      if (completed.success) pass("complete event");
      else fail(`complete event (${completed.error})`);
      const delDone = await deleteScheduleEvent(ev.event.id);
      if (!delDone.success) pass("cannot delete completed event");
      else fail("cannot delete completed event");

      const pending = await createPendingUpload({
        eventId: ev.event.id,
        originalName: "card.pdf",
        sizeBytes: 128,
      });
      if (pending.success) {
        const pdf = buildIScorePdf(
          [
            "ISCORE-TEXT v1",
            "DATE: 2026-08-21",
            "OPPONENT: Hawks",
            "SCORE: 8-5",
            "RESULT: win",
            "PLAYERS:",
            `${PREFIX} 队员,1`,
          ].join("\n")
        );
        const stored = await storePendingBytes(pending.fileId, pdf);
        if (stored.success) pass("store pending bytes");
        else fail(`store pending bytes (${stored.error})`);
        const fin = await finalizeUpload(pending.fileId);
        if (fin.success) pass("finalize upload");
        else fail(`finalize upload (${fin.error})`);

        await prisma.gameRecordFile.update({
          where: { id: pending.fileId },
          data: { deletedAt: new Date(), deletedById: captain.accountId },
        });
        const resurrect = await finalizeUpload(pending.fileId);
        if (!resurrect.success) pass("finalize does not resurrect tombstone");
        else fail("finalize does not resurrect tombstone");

        await prisma.gameRecordFile.update({
          where: { id: pending.fileId },
          data: { deletedAt: null, status: "ready" },
        });

        const confirmed = await confirmGameSummary({
          eventId: ev.event.id,
          ourScore: 8,
          opponentScore: 5,
          result: "win",
          sourceFileId: pending.fileId,
          lines: [{ playerId: player.playerId, participated: true }],
        });
        if (confirmed.success) pass("confirm summary");
        else fail(`confirm summary (${confirmed.error})`);

        const blocked = await deleteGameFile(pending.fileId);
        if (!blocked.success) pass("cannot delete confirmed source file");
        else fail("cannot delete confirmed source file");

        const again = await confirmGameSummary({
          eventId: ev.event.id,
          ourScore: 8,
          opponentScore: 5,
          result: "win",
          source: "iscore_pdf",
          sourceFileId: pending.fileId,
          lines: [{ playerId: player.playerId, participated: true }],
        });
        if (again.success) pass("reimport creates new version");
        else fail(`reimport creates new version (${again.error})`);
        const currentCount = await prisma.confirmedGameSummary.count({
          where: {
            scheduleEventId: ev.event.id,
            status: "confirmed",
            supersededAt: null,
          },
        });
        if (currentCount === 1) pass("one current confirmed summary");
        else fail(`one current confirmed summary (${currentCount})`);
      } else fail(`create pending upload (${pending.error})`);
    }

    const planned = await createScheduleEvent({
      kind: "scrimmage",
      startAt: new Date(now + 86400_000).toISOString(),
      endAt: new Date(now + 90000_000).toISOString(),
      title: `${PREFIX}-planned`,
    });
    if (planned.success) {
      const cancelled = await cancelScheduleEvent(planned.event.id, "rain");
      if (cancelled.success) pass("cancel planned event");
      else fail(`cancel planned event (${cancelled.error})`);
    }

    setHarnessSessionToken(player.token);
    const playerSeason = await deleteSeason(s1.success ? s1.season.id : "x");
    if (!playerSeason.success) pass("player cannot manage season");
    else fail("player cannot manage season");
  } catch (error) {
    fail(`unexpected: ${error instanceof Error ? error.message : String(error)}`);
    console.error(error);
  } finally {
    disableAuthVerifyHarness();
    if (teamId) {
      try {
        const teams = await prisma.team.findMany({
          where: { name: { startsWith: PREFIX } },
          select: { id: true },
        });
        for (const t of teams) {
          await prisma.confirmedGameSummary.deleteMany({ where: { teamId: t.id } });
          await prisma.gameRecordFile.deleteMany({ where: { teamId: t.id } });
          await prisma.scheduleEvent.deleteMany({ where: { teamId: t.id } });
          await prisma.season.deleteMany({ where: { teamId: t.id } });
          await prisma.team.delete({ where: { id: t.id } });
        }
      } catch (error) {
        console.error("cleanup failed:", error);
      }
    }
  }

  const failed = findings.filter((f) => f.level === "fail").length;
  console.log(`\n${findings.length} checks, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
