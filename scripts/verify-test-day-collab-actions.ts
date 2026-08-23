/**
 * 协作测试日 Action 写库回归（独立 TEST_DATABASE_URL）
 * npm run verify:test-day-collab-actions
 */
import "./loadTestDb";
import { prisma } from "../lib/db";
import { getOrCreateDefaultTeam } from "../lib/team";
import { hashPassword } from "../lib/auth/password";
import { createSession } from "../lib/auth/session";
import {
  disableAuthVerifyHarness,
  enableAuthVerifyHarness,
  setHarnessClientIp,
  setHarnessSessionToken,
  runWithHarnessSession,
} from "../lib/auth/request";
import type { RoleKind } from "../lib/auth/types";
import {
  createTestDayDraft,
  freezeTestDayDraft,
  getTestDayDraft,
  joinTestDayDraft,
  updateTestDayDraftStructure,
} from "../lib/testDay/draftActions";
import {
  abandonTestDayFailedOutbox,
  confirmTestDayArchiveReady,
  reportTestDayDeviceOutbox,
} from "../lib/testDay/deviceActions";
import {
  submitTestDayEntry as submitTestDayEntryRaw,
  tombstoneTestDayEntry as tombstoneTestDayEntryRaw,
} from "../lib/testDay/entryActions";
import {
  archiveTestDayDraft,
  resolveTestDayConflict,
} from "../lib/testDay/collabActions";
import { getArchivedTestSession } from "../lib/testDay/sessionReadActions";
import { SPEED_FIRST_BASE_COLUMN_ID } from "../lib/gameArchive";
import { DEFAULT_TEST_ITEMS } from "../lib/sessionDraft";
import { addCalendarDays, ARCHIVE_SAME_DAY_ERROR } from "../lib/dateOnly";
import { ARCHIVE_ABANDON_WHILE_READY_ERROR, ARCHIVE_DEVICE_LOCKED_ERROR, ARCHIVE_DEVICES_NOT_READY_ERROR, ARCHIVE_OPEN_CONFLICT_ERROR, ARCHIVE_SELF_PENDING_ERROR } from "../lib/testDay/collab/archiveReady";
import { getTeamTodayDateStr } from "../lib/season/timeZone";
import {
  STRUCTURE_STALE_VERSION_ERROR,
  STRUCTURE_VERSION_REQUIRED_ERROR,
} from "../lib/testDay/archiveValidation";

const findings: { level: "pass" | "fail"; msg: string }[] = [];
function pass(msg: string) {
  findings.push({ level: "pass", msg });
  console.log("PASS", msg);
}
function fail(msg: string) {
  findings.push({ level: "fail", msg });
  console.error("FAIL", msg);
}

const runId = `vtc${Date.now().toString(36)}`;
const PASSWORD = "verify-pass-1";

type Seeded = {
  accountId: string;
  playerId: string | null;
  token: string;
  username: string;
  displayName: string;
};

async function seedAccount(input: {
  teamId: string;
  username: string;
  roles: RoleKind[];
  displayName: string;
}): Promise<Seeded> {
  const passwordHash = await hashPassword(PASSWORD);
  const player = await prisma.player.create({
    data: {
      teamId: input.teamId,
      name: input.displayName,
      role: "player",
    },
  });
  const account = await prisma.account.create({
    data: {
      teamId: input.teamId,
      username: input.username,
      passwordHash,
      playerId: player.id,
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
      status: "approved",
      displayName: input.displayName,
      playerId: player.id,
      reviewedAt: new Date(),
    },
  });
  const token = await createSession(account.id);
  return {
    accountId: account.id,
    playerId: player.id,
    token,
    username: input.username,
    displayName: input.displayName,
  };
}

let currentToken = "";
const deviceByToken = new Map<string, string>();
let extraDeviceSeq = 0;

function deviceOf(token = currentToken): string {
  const existing = deviceByToken.get(token);
  if (existing) return existing;
  const next = `vdev_${runId}_${deviceByToken.size + 1}`;
  deviceByToken.set(token, next);
  return next;
}

function extraDeviceId(): string {
  extraDeviceSeq += 1;
  return `vdevx_${runId}_${extraDeviceSeq}`;
}

function asUser(token: string | undefined) {
  currentToken = token ?? "";
  setHarnessSessionToken(token);
}

async function submitTestDayEntry(
  input: Omit<Parameters<typeof submitTestDayEntryRaw>[0], "deviceId"> & {
    deviceId?: string;
  }
) {
  return submitTestDayEntryRaw({
    ...input,
    deviceId: input.deviceId || deviceOf(),
  });
}

async function tombstoneTestDayEntry(
  input: Omit<Parameters<typeof tombstoneTestDayEntryRaw>[0], "deviceId"> & {
    deviceId?: string;
  }
) {
  return tombstoneTestDayEntryRaw({
    ...input,
    deviceId: input.deviceId || deviceOf(),
  });
}

const EMPTY_OUTBOX = { pendingCount: 0, failedCount: 0 };

async function confirmMembers(draftId: string, tokens: string[]): Promise<boolean> {
  for (const token of tokens) {
    asUser(token);
    const res = await confirmTestDayArchiveReady(
      draftId,
      deviceOf(token),
      EMPTY_OUTBOX
    );
    if (!res.success) {
      fail(`confirm archive ready (${res.error})`);
      return false;
    }
  }
  return true;
}

function speedPayload(input: {
  id: string;
  playerId: string;
  playerName: string;
  seconds: number;
}) {
  return {
    id: input.id,
    playerId: input.playerId,
    playerName: input.playerName,
    columnId: SPEED_FIRST_BASE_COLUMN_ID,
    seconds: input.seconds,
    timestamp: Date.now(),
  };
}

async function cleanup(usernames: string[], playerNames: string[]) {
  const accounts = await prisma.account.findMany({
    where: { username: { in: usernames } },
    select: { id: true },
  });
  const accountIds = accounts.map((row) => row.id);
  if (accountIds.length > 0) {
    const drafts = await prisma.testDayDraft.findMany({
      where: { createdByAccountId: { in: accountIds } },
      select: { id: true },
    });
    const draftIds = drafts.map((row) => row.id);
    if (draftIds.length > 0) {
      await prisma.testSession.deleteMany({
        where: { sourceDraftId: { in: draftIds } },
      });
      await prisma.testDayDraft.deleteMany({ where: { id: { in: draftIds } } });
    }
    await prisma.authSession.deleteMany({
      where: { accountId: { in: accountIds } },
    });
    await prisma.account.deleteMany({ where: { id: { in: accountIds } } });
  }
  await prisma.player.deleteMany({ where: { name: { in: playerNames } } });
}

async function main() {
  enableAuthVerifyHarness();
  setHarnessClientIp(`verify-${runId}`);
  const usernames: string[] = [];
  const playerNames: string[] = [];
  try {
    const team = await getOrCreateDefaultTeam();
    const captain = await seedAccount({
      teamId: team.id,
      username: `${runId}_cap`,
      roles: ["player", "captain"],
      displayName: `${runId}_队长`,
    });
    const player = await seedAccount({
      teamId: team.id,
      username: `${runId}_pl`,
      roles: ["player"],
      displayName: `${runId}_队员`,
    });
    usernames.push(captain.username, player.username);
    playerNames.push(captain.displayName, player.displayName);
    if (!captain.playerId || !player.playerId) {
      fail("seed players");
      return;
    }
    const captainPlayerId = captain.playerId;
    const playerPlayerId = player.playerId;

    asUser(captain.token);
    const created = await createTestDayDraft();
    if (!created.success) {
      fail(`create draft (${created.error})`);
      return;
    }
    pass("create draft");

    asUser(captain.token);
    const missingStructureVersion = await updateTestDayDraftStructure(
      created.id,
      { testItems: [...DEFAULT_TEST_ITEMS] }
    );
    if (
      !missingStructureVersion.success &&
      missingStructureVersion.error === STRUCTURE_VERSION_REQUIRED_ERROR
    ) {
      pass("missing structure version rejected");
    } else fail("missing structure version rejected");

    asUser(captain.token);
    const staleStructure = await updateTestDayDraftStructure(created.id, {
      expectedVersion: 0,
      testItems: [...DEFAULT_TEST_ITEMS],
    });
    if (
      !staleStructure.success &&
      staleStructure.error === STRUCTURE_STALE_VERSION_ERROR
    ) {
      pass("stale structure version rejected");
    } else fail("stale structure version rejected");
    const freshStructure = await updateTestDayDraftStructure(created.id, {
      expectedVersion: 1,
      testItems: [...DEFAULT_TEST_ITEMS],
    });
    if (freshStructure.success && freshStructure.version === 2) {
      pass("matching structure version accepted");
    } else fail("matching structure version accepted");

    asUser(player.token);
    const joined = await joinTestDayDraft(created.id);
    if (joined.success) pass("join draft");
    else fail(`join draft (${joined.error})`);

    const sameA = speedPayload({
      id: `${runId}-s1`,
      playerId: captain.playerId,
      playerName: captain.displayName,
      seconds: 4.2,
    });
    asUser(captain.token);
    const first = await submitTestDayEntry({
      draftId: created.id,
      kind: "speed_mark",
      payload: sameA,
    });
    const replay = await submitTestDayEntry({
      draftId: created.id,
      kind: "speed_mark",
      payload: sameA,
    });
    if (first.success && replay.success && first.id === replay.id && !replay.conflicted) {
      pass("replay same clientEntryId is idempotent");
    } else fail("replay same clientEntryId is idempotent");

    asUser(player.token);
    const sameB = speedPayload({
      id: `${runId}-s1b`,
      playerId: captain.playerId,
      playerName: captain.displayName,
      seconds: 4.2,
    });
    const reused = await submitTestDayEntry({
      draftId: created.id,
      kind: "speed_mark",
      payload: sameB,
    });
    if (reused.success && !reused.conflicted) pass("same cell value is reused");
    else fail(`same cell value is reused (${reused.success ? "conflicted" : reused.error})`);

    const mismatch = speedPayload({
      id: `${runId}-s2`,
      playerId: captain.playerId,
      playerName: captain.displayName,
      seconds: 4.8,
    });
    const conflicted = await submitTestDayEntry({
      draftId: created.id,
      kind: "speed_mark",
      payload: mismatch,
    });
    if (conflicted.success && conflicted.conflicted) pass("different value opens conflict");
    else fail(`different value opens conflict (${conflicted.success ? "no conflict" : conflicted.error})`);

    asUser(captain.token);
    const blocked = await archiveTestDayDraft(created.id);
    if (!blocked.success) pass("open conflict blocks archive");
    else fail("open conflict blocks archive");

    const loaded = await getTestDayDraft(created.id);
    const openConflict = loaded.success
      ? loaded.draft.conflicts.find((row) => row.reviewStatus === "open")
      : undefined;
    if (!openConflict) {
      fail("load open conflict");
      return;
    }
    asUser(captain.token);
    const confirmWhileOpen = await confirmTestDayArchiveReady(
      created.id,
      deviceOf(captain.token),
      EMPTY_OUTBOX
    );
    if (
      !confirmWhileOpen.success &&
      confirmWhileOpen.error === ARCHIVE_OPEN_CONFLICT_ERROR
    ) {
      pass("open conflict rejects confirm");
    } else fail("open conflict rejects confirm");

    const dismissed = await resolveTestDayConflict({
      draftId: created.id,
      conflictId: openConflict.id,
      decision: "dismiss",
    });
    if (!dismissed.success) pass("dismiss value_mismatch rejected");
    else fail("dismiss value_mismatch rejected");

    const badPick = await resolveTestDayConflict({
      draftId: created.id,
      conflictId: openConflict.id,
      decision: "pick",
      entryId: "not-a-candidate",
    });
    if (!badPick.success) pass("pick outside candidates rejected");
    else fail("pick outside candidates rejected");

    asUser(player.token);
    const playerPick = await resolveTestDayConflict({
      draftId: created.id,
      conflictId: openConflict.id,
      decision: "pick",
      entryId: openConflict.candidateEntryIds[0],
    });
    if (!playerPick.success) pass("player cannot resolve conflict");
    else fail("player cannot resolve conflict");

    asUser(captain.token);
    const frozen = await freezeTestDayDraft(created.id);
    if (frozen.success) pass("freeze draft");
    else fail(`freeze draft (${frozen.error})`);

    const structure = await updateTestDayDraftStructure(created.id, {
      expectedVersion: 2,
      testItems: [...DEFAULT_TEST_ITEMS, `加项${runId}`],
    });
    if (!structure.success) pass("frozen draft rejects structure patch");
    else fail("frozen draft rejects structure patch");

    const picked = await resolveTestDayConflict({
      draftId: created.id,
      conflictId: openConflict.id,
      decision: "pick",
      entryId: openConflict.candidateEntryIds[0],
    });
    if (picked.success) pass("captain pick candidate");
    else fail(`captain pick candidate (${picked.error})`);

    asUser(captain.token);
    const afterPickNoAck = await archiveTestDayDraft(created.id);
    if (
      !afterPickNoAck.success &&
      afterPickNoAck.error === ARCHIVE_DEVICES_NOT_READY_ERROR
    ) {
      pass("resolve conflict still requires reconfirm");
    } else fail("resolve conflict still requires reconfirm");

    await confirmMembers(created.id, [captain.token, player.token]);
    asUser(captain.token);
    const archived = await archiveTestDayDraft(created.id);
    if (archived.success) pass("archive after pick");
    else fail(`archive after pick (${archived.error})`);

    if (archived.success) {
      const after = await getTestDayDraft(created.id);
      if (
        after.success &&
        after.draft.status === "archived" &&
        after.draft.archivedSessionId === archived.sessionId
      ) {
        pass("archived draft points at TestSession");
      } else fail("archived draft points at TestSession");
      const detail = await getArchivedTestSession(archived.sessionId);
      if (detail.success && detail.session.sourceDraftId === created.id) {
        pass("read archived TestSession");
      } else fail("read archived TestSession");
    }

    const afterArchive = await submitTestDayEntry({
      draftId: created.id,
      kind: "speed_mark",
      payload: speedPayload({
        id: `${runId}-late`,
        playerId: captain.playerId,
        playerName: captain.displayName,
        seconds: 5,
      }),
    });
    if (!afterArchive.success) pass("archived draft rejects new entry");
    else fail("archived draft rejects new entry");

    const created2 = await createTestDayDraft();
    if (!created2.success) {
      fail(`create second draft (${created2.error})`);
      return;
    }
    asUser(player.token);
    await joinTestDayDraft(created2.id);
    asUser(captain.token);
    const keep = await submitTestDayEntry({
      draftId: created2.id,
      kind: "speed_mark",
      payload: speedPayload({
        id: `${runId}-del`,
        playerId: captain.playerId,
        playerName: captain.displayName,
        seconds: 3.9,
      }),
    });
    if (!keep.success) {
      fail(`seed delete-request entry (${keep.error})`);
      return;
    }
    asUser(player.token);
    const delReq = await tombstoneTestDayEntry({
      draftId: created2.id,
      clientEntryId: `${runId}-del`,
    });
    if (delReq.success) pass("non-author creates delete_request");
    else fail(`non-author creates delete_request (${delReq.error})`);

    asUser(captain.token);
    const delDraft = await getTestDayDraft(created2.id);
    const deleteConflict = delDraft.success
      ? delDraft.draft.conflicts.find((row) => row.type === "delete_request")
      : undefined;
    if (
      delDraft.success &&
      delDraft.draft.snapshot.speedMarks.length === 1 &&
      deleteConflict
    ) {
      pass("open delete_request still projects mark");
    } else fail("open delete_request still projects mark");
    const blockedDeleteArchive = await archiveTestDayDraft(created2.id);
    if (!blockedDeleteArchive.success) pass("open delete_request blocks archive");
    else fail("open delete_request blocks archive");
    if (!deleteConflict) {
      fail("load delete_request");
      return;
    }
    const approved = await resolveTestDayConflict({
      draftId: created2.id,
      conflictId: deleteConflict.id,
      decision: "approve_delete",
    });
    if (approved.success) pass("approve delete_request");
    else fail(`approve delete_request (${approved.error})`);

    const created3 = await createTestDayDraft();
    if (!created3.success) {
      fail(`create third draft (${created3.error})`);
      return;
    }
    const noteV1 = {
      id: `${runId}-g`,
      revisionId: `${runId}-r1`,
      testItem: "折返",
      memberIds: [captain.playerId, player.playerId],
      memberNames: [captain.displayName, player.displayName],
      note: "第一版",
      timestamp: Date.now(),
    };
    const note1 = await submitTestDayEntry({
      draftId: created3.id,
      kind: "custom_group_note",
      payload: noteV1,
    });
    if (note1.success) pass("submit group note v1");
    else fail(`submit group note v1 (${note1.error})`);
    const tomb = await tombstoneTestDayEntry({
      draftId: created3.id,
      clientEntryId: noteV1.revisionId,
    });
    if (tomb.success) pass("author tombstones group note v1");
    else fail(`author tombstones group note v1 (${tomb.error})`);
    const noteV2 = {
      ...noteV1,
      revisionId: `${runId}-r2`,
      note: "第二版",
      timestamp: Date.now() + 1,
    };
    const note2 = await submitTestDayEntry({
      draftId: created3.id,
      kind: "custom_group_note",
      payload: noteV2,
    });
    if (note2.success && !note2.conflicted) pass("group note v2 inserts");
    else fail(`group note v2 inserts (${note2.success ? "conflicted" : note2.error})`);
    const notes = await getTestDayDraft(created3.id);
    if (
      notes.success &&
      notes.draft.snapshot.customGroupNotes[0]?.note === "第二版"
    ) {
      pass("projection keeps latest group note");
    } else fail("projection keeps latest group note");
    await confirmMembers(created3.id, [captain.token]);
    asUser(captain.token);
    const archivedNotes = await archiveTestDayDraft(created3.id);
    if (archivedNotes.success) pass("archive after group-note reedit");
    else fail(`archive after group-note reedit (${archivedNotes.error})`);

    const emptyDraft = await createTestDayDraft();
    if (!emptyDraft.success) {
      fail(`create empty draft (${emptyDraft.error})`);
      return;
    }
    const emptyArchive = await archiveTestDayDraft(emptyDraft.id);
    if (!emptyArchive.success) pass("empty draft rejects archive");
    else fail("empty draft rejects archive");

    const ackDraft = await createTestDayDraft();
    if (!ackDraft.success) {
      fail(`create ack draft (${ackDraft.error})`);
      return;
    }
    asUser(player.token);
    await joinTestDayDraft(ackDraft.id);
    asUser(captain.token);
    const ackMark = await submitTestDayEntry({
      draftId: ackDraft.id,
      kind: "speed_mark",
      payload: speedPayload({
        id: `${runId}-ack`,
        playerId: captainPlayerId,
        playerName: captain.displayName,
        seconds: 3.7,
      }),
    });
    if (!ackMark.success) {
      fail(`seed ack draft (${ackMark.error})`);
      return;
    }
    const noAck = await archiveTestDayDraft(ackDraft.id);
    if (
      !noAck.success &&
      noAck.error === ARCHIVE_DEVICES_NOT_READY_ERROR
    ) {
      pass("archive without device confirm rejected");
    } else fail("archive without device confirm rejected");
    asUser(captain.token);
    await confirmMembers(ackDraft.id, [captain.token]);
    const locked = await submitTestDayEntry({
      draftId: ackDraft.id,
      kind: "speed_mark",
      payload: speedPayload({
        id: `${runId}-locked`,
        playerId: captainPlayerId,
        playerName: captain.displayName,
        seconds: 3.8,
      }),
    });
    if (!locked.success && locked.error === ARCHIVE_DEVICE_LOCKED_ERROR) {
      pass("confirmed device cannot submit");
    } else fail("confirmed device cannot submit");
    const otherDevice = extraDeviceId();
    const otherWrite = await submitTestDayEntry({
      draftId: ackDraft.id,
      kind: "speed_mark",
      payload: speedPayload({
        id: `${runId}-otherdev`,
        playerId: playerPlayerId,
        playerName: player.displayName,
        seconds: 3.9,
      }),
      deviceId: otherDevice,
    });
    if (otherWrite.success) pass("other device of same account can still write");
    else fail(`other device of same account can still write (${otherWrite.error})`);
    const afterOther = await archiveTestDayDraft(ackDraft.id);
    if (!afterOther.success) pass("new device write clears prior confirms");
    else fail("new device write clears prior confirms");
    asUser(player.token);
    const missingDevice = await confirmTestDayArchiveReady(
      ackDraft.id,
      "x",
      EMPTY_OUTBOX
    );
    if (!missingDevice.success) pass("invalid deviceId rejected on confirm");
    else fail("invalid deviceId rejected on confirm");
    await confirmMembers(ackDraft.id, [captain.token]);
    asUser(captain.token);
    const stillBlocked = await archiveTestDayDraft(ackDraft.id);
    if (!stillBlocked.success) pass("unconfirmed extra device still blocks archive");
    else fail("unconfirmed extra device still blocks archive");
    asUser(captain.token);
    const extraConfirm = await confirmTestDayArchiveReady(
      ackDraft.id,
      otherDevice,
      EMPTY_OUTBOX
    );
    if (!extraConfirm.success) {
      fail(`confirm extra device (${extraConfirm.error})`);
    }
    await confirmMembers(ackDraft.id, [player.token, captain.token]);
    asUser(captain.token);
    const fullAck = await archiveTestDayDraft(ackDraft.id);
    if (fullAck.success) pass("archive after all devices confirm");
    else fail(`archive after all devices confirm (${fullAck.error})`);

    const gateDraft = await createTestDayDraft();
    if (!gateDraft.success) {
      fail(`create gate draft (${gateDraft.error})`);
      return;
    }
    asUser(player.token);
    await joinTestDayDraft(gateDraft.id);
    asUser(captain.token);
    const gateMark = await submitTestDayEntry({
      draftId: gateDraft.id,
      kind: "speed_mark",
      payload: speedPayload({
        id: `${runId}-gate`,
        playerId: captainPlayerId,
        playerName: captain.displayName,
        seconds: 3.6,
      }),
    });
    if (!gateMark.success) {
      fail(`seed gate draft (${gateMark.error})`);
      return;
    }
    const pendingConfirm = await confirmTestDayArchiveReady(
      gateDraft.id,
      deviceOf(captain.token),
      { pendingCount: 1, failedCount: 0 }
    );
    if (
      !pendingConfirm.success &&
      pendingConfirm.error === ARCHIVE_SELF_PENDING_ERROR
    ) {
      pass("confirm with pending outbox rejected");
    } else fail("confirm with pending outbox rejected");
    await confirmMembers(gateDraft.id, [captain.token, player.token]);
    asUser(captain.token);
    const reported = await reportTestDayDeviceOutbox(
      gateDraft.id,
      deviceOf(captain.token),
      { pendingCount: 1, failedCount: 0 }
    );
    if (reported.success && !reported.allDevicesArchiveReady) {
      pass("report pending clears device ready");
    } else fail("report pending clears device ready");
    const afterReport = await archiveTestDayDraft(gateDraft.id);
    if (!afterReport.success) pass("archive blocked after pending report");
    else fail("archive blocked after pending report");
    await confirmMembers(gateDraft.id, [captain.token, player.token]);
    asUser(captain.token);
    const abandonReady = await abandonTestDayFailedOutbox({
      draftId: gateDraft.id,
      deviceId: deviceOf(captain.token),
      dedupeKey: `${runId}-abandon`,
      kind: "test_day_entry",
      failedReason: "verify",
    });
    if (
      !abandonReady.success &&
      abandonReady.error === ARCHIVE_ABANDON_WHILE_READY_ERROR
    ) {
      pass("abandon failed while confirmed rejected");
    } else fail("abandon failed while confirmed rejected");
    const gateLoaded = await getTestDayDraft(gateDraft.id);
    const gateVersion = gateLoaded.success ? gateLoaded.draft.version : 1;
    const structureAfterReady = await updateTestDayDraftStructure(
      gateDraft.id,
      {
        expectedVersion: gateVersion,
        testItems: [...DEFAULT_TEST_ITEMS],
      }
    );
    if (structureAfterReady.success) pass("structure patch after confirm");
    else fail(`structure patch after confirm (${structureAfterReady.error})`);
    const afterPatch = await archiveTestDayDraft(gateDraft.id);
    if (!afterPatch.success) pass("structure patch clears device ready");
    else fail("structure patch clears device ready");
    await confirmMembers(gateDraft.id, [captain.token, player.token]);
    asUser(captain.token);
    const afterReconfirm = await archiveTestDayDraft(gateDraft.id);
    if (afterReconfirm.success) pass("archive after reconfirming patched board");
    else fail(`archive after reconfirming patched board (${afterReconfirm.error})`);

    const raceDraft = await createTestDayDraft();
    if (!raceDraft.success) {
      fail(`create race draft (${raceDraft.error})`);
      return;
    }
    asUser(player.token);
    await joinTestDayDraft(raceDraft.id);
    const [raceA, raceB] = await Promise.all([
      runWithHarnessSession(captain.token, () =>
        submitTestDayEntry({
          draftId: raceDraft.id,
          kind: "speed_mark",
          payload: speedPayload({
            id: `${runId}-race-a`,
            playerId: captainPlayerId,
            playerName: captain.displayName,
            seconds: 4.1,
          }),
          deviceId: deviceOf(captain.token),
        })
      ),
      runWithHarnessSession(player.token, () =>
        submitTestDayEntry({
          draftId: raceDraft.id,
          kind: "speed_mark",
          payload: speedPayload({
            id: `${runId}-race-b`,
            playerId: captainPlayerId,
            playerName: captain.displayName,
            seconds: 4.9,
          }),
          deviceId: deviceOf(player.token),
        })
      ),
    ]);
    if (raceA.success && raceB.success) {
      asUser(captain.token);
      const raced = await getTestDayDraft(raceDraft.id);
      const openMismatches = raced.success
        ? raced.draft.conflicts.filter(
            (row) => row.type === "value_mismatch" && row.reviewStatus === "open"
          )
        : [];
      if (openMismatches.length === 1) pass("concurrent mismatch yields one open conflict");
      else fail(`concurrent mismatch yields one open conflict (${openMismatches.length})`);
    } else {
      fail(
        `concurrent mismatch submits (${raceA.success ? "ok" : raceA.error} / ${raceB.success ? "ok" : raceB.error})`
      );
    }
    asUser(captain.token);

    const dualDraft = await createTestDayDraft();
    if (!dualDraft.success) {
      fail(`create dual draft (${dualDraft.error})`);
      return;
    }
    asUser(player.token);
    await joinTestDayDraft(dualDraft.id);
    asUser(captain.token);
    const dualA = await submitTestDayEntry({
      draftId: dualDraft.id,
      kind: "speed_mark",
      payload: speedPayload({
        id: `${runId}-dual-a`,
        playerId: captain.playerId,
        playerName: captain.displayName,
        seconds: 3.8,
      }),
    });
    asUser(player.token);
    const dualB = await submitTestDayEntry({
      draftId: dualDraft.id,
      kind: "speed_mark",
      payload: speedPayload({
        id: `${runId}-dual-b`,
        playerId: playerPlayerId,
        playerName: player.displayName,
        seconds: 4.0,
      }),
    });
    asUser(captain.token);
    await confirmMembers(dualDraft.id, [captain.token, player.token]);
    asUser(captain.token);
    const dualArchive = await archiveTestDayDraft(dualDraft.id);
    if (dualA.success && dualB.success && dualArchive.success) {
      pass("two players archive two cells");
    } else {
      fail(
        `two players archive two cells (${
          !dualA.success
            ? dualA.error
            : !dualB.success
              ? dualB.error
              : !dualArchive.success
                ? dualArchive.error
                : "unknown"
        })`
      );
    }

    const today = getTeamTodayDateStr(team.timeZone);
    const yesterday = addCalendarDays(today, -1);
    const tooOld = addCalendarDays(today, -3);
    asUser(captain.token);
    const lateDraft = await createTestDayDraft(yesterday);
    if (!lateDraft.success) {
      fail(`create yesterday draft (${lateDraft.error})`);
    } else {
      const lateMark = await submitTestDayEntry({
        draftId: lateDraft.id,
        kind: "speed_mark",
        payload: speedPayload({
          id: `${runId}-late`,
          playerId: captainPlayerId,
          playerName: captain.displayName,
          seconds: 4.1,
        }),
      });
      await confirmMembers(lateDraft.id, [captain.token]);
      asUser(captain.token);
      const lateArchive = await archiveTestDayDraft(lateDraft.id);
      if (lateMark.success && lateArchive.success) {
        pass("yesterday draft can late-archive");
      } else {
        fail(
          `yesterday draft can late-archive (${
            !lateMark.success
              ? lateMark.error
              : !lateArchive.success
                ? lateArchive.error
                : "unknown"
          })`
        );
      }
    }
    const oldDraft = await createTestDayDraft(tooOld);
    if (!oldDraft.success) {
      fail(`create old draft (${oldDraft.error})`);
    } else {
      const oldMark = await submitTestDayEntry({
        draftId: oldDraft.id,
        kind: "speed_mark",
        payload: speedPayload({
          id: `${runId}-old`,
          playerId: captainPlayerId,
          playerName: captain.displayName,
          seconds: 4.1,
        }),
      });
      const oldArchive = await archiveTestDayDraft(oldDraft.id);
      if (
        oldMark.success &&
        !oldArchive.success &&
        oldArchive.error === ARCHIVE_SAME_DAY_ERROR
      ) {
        pass("older than yesterday cannot archive");
      } else {
        fail("older than yesterday cannot archive");
      }
    }
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

  const failed = findings.filter((row) => row.level === "fail").length;
  console.log(`\n${findings.length} checks, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
