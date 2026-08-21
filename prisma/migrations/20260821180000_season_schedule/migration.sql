-- CreateEnum
CREATE TYPE "SeasonStatus" AS ENUM ('planned', 'active', 'archived');
CREATE TYPE "ScheduleEventKind" AS ENUM ('game', 'scrimmage');
CREATE TYPE "ScheduleEventStatus" AS ENUM ('planned', 'cancelled', 'completed');
CREATE TYPE "GameRecordFileStatus" AS ENUM ('pending', 'ready');
CREATE TYPE "GameSummaryStatus" AS ENUM ('draft', 'confirmed');
CREATE TYPE "GameResultKind" AS ENUM ('win', 'loss', 'tie', 'unknown');
CREATE TYPE "GameSummarySource" AS ENUM ('manual', 'iscore_pdf');

ALTER TABLE "Team" ADD COLUMN "timeZone" TEXT NOT NULL DEFAULT 'Asia/Shanghai';

CREATE TABLE "Season" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startsOn" DATE NOT NULL,
    "endsOn" DATE NOT NULL,
    "effectiveEndsOn" DATE NOT NULL,
    "status" "SeasonStatus" NOT NULL DEFAULT 'planned',
    "activatedById" TEXT,
    "archivedById" TEXT,
    "activatedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Season_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Season_dates_order" CHECK ("startsOn" <= "endsOn"),
    CONSTRAINT "Season_effective_order" CHECK ("startsOn" <= "effectiveEndsOn")
);

CREATE UNIQUE INDEX "Season_id_teamId_key" ON "Season"("id", "teamId");
CREATE INDEX "Season_teamId_status_idx" ON "Season"("teamId", "status");
CREATE UNIQUE INDEX "Season_one_active_per_team" ON "Season"("teamId") WHERE "status" = 'active';

CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "Season"
  ADD CONSTRAINT "Season_team_dates_excl"
  EXCLUDE USING gist (
    "teamId" WITH =,
    daterange("startsOn", "effectiveEndsOn", '[]') WITH &&
  );

CREATE TABLE "ScheduleEvent" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "seasonId" TEXT,
    "kind" "ScheduleEventKind" NOT NULL,
    "status" "ScheduleEventStatus" NOT NULL DEFAULT 'planned',
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "opponent" TEXT,
    "venue" TEXT,
    "title" TEXT,
    "note" TEXT,
    "statusNote" TEXT,
    "correctedAt" TIMESTAMP(3),
    "correctedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduleEvent_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ScheduleEvent_time_order" CHECK ("endAt" > "startAt")
);

CREATE INDEX "ScheduleEvent_teamId_startAt_idx" ON "ScheduleEvent"("teamId", "startAt");
CREATE INDEX "ScheduleEvent_seasonId_idx" ON "ScheduleEvent"("seasonId");

CREATE TABLE "GameRecordFile" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "scheduleEventId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'upload',
    "status" "GameRecordFileStatus" NOT NULL DEFAULT 'pending',
    "uploadedById" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),
    "deletedById" TEXT,
    "retainEvidence" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GameRecordFile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GameRecordFile_storageKey_key" ON "GameRecordFile"("storageKey");
CREATE INDEX "GameRecordFile_scheduleEventId_status_idx" ON "GameRecordFile"("scheduleEventId", "status");
CREATE INDEX "GameRecordFile_teamId_idx" ON "GameRecordFile"("teamId");

CREATE TABLE "ConfirmedGameSummary" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "scheduleEventId" TEXT NOT NULL,
    "status" "GameSummaryStatus" NOT NULL DEFAULT 'draft',
    "ourScore" INTEGER,
    "opponentScore" INTEGER,
    "result" "GameResultKind" NOT NULL DEFAULT 'unknown',
    "source" "GameSummarySource" NOT NULL DEFAULT 'manual',
    "sourceFileId" TEXT,
    "confirmedById" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "supersededAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConfirmedGameSummary_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ConfirmedGameSummary_scheduleEventId_status_idx" ON "ConfirmedGameSummary"("scheduleEventId", "status");
CREATE INDEX "ConfirmedGameSummary_teamId_idx" ON "ConfirmedGameSummary"("teamId");
CREATE UNIQUE INDEX "ConfirmedGameSummary_current_confirmed"
  ON "ConfirmedGameSummary"("scheduleEventId")
  WHERE "status" = 'confirmed' AND "supersededAt" IS NULL;

CREATE TABLE "ConfirmedGamePlayerLine" (
    "id" TEXT NOT NULL,
    "summaryId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "participated" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ConfirmedGamePlayerLine_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ConfirmedGamePlayerLine_summaryId_playerId_key" ON "ConfirmedGamePlayerLine"("summaryId", "playerId");
CREATE INDEX "ConfirmedGamePlayerLine_playerId_idx" ON "ConfirmedGamePlayerLine"("playerId");

ALTER TABLE "Season" ADD CONSTRAINT "Season_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Season" ADD CONSTRAINT "Season_activatedById_fkey" FOREIGN KEY ("activatedById") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Season" ADD CONSTRAINT "Season_archivedById_fkey" FOREIGN KEY ("archivedById") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ScheduleEvent" ADD CONSTRAINT "ScheduleEvent_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ScheduleEvent" ADD CONSTRAINT "ScheduleEvent_seasonId_teamId_fkey" FOREIGN KEY ("seasonId", "teamId") REFERENCES "Season"("id", "teamId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ScheduleEvent" ADD CONSTRAINT "ScheduleEvent_correctedById_fkey" FOREIGN KEY ("correctedById") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "GameRecordFile" ADD CONSTRAINT "GameRecordFile_scheduleEventId_fkey" FOREIGN KEY ("scheduleEventId") REFERENCES "ScheduleEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GameRecordFile" ADD CONSTRAINT "GameRecordFile_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GameRecordFile" ADD CONSTRAINT "GameRecordFile_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ConfirmedGameSummary" ADD CONSTRAINT "ConfirmedGameSummary_scheduleEventId_fkey" FOREIGN KEY ("scheduleEventId") REFERENCES "ScheduleEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConfirmedGameSummary" ADD CONSTRAINT "ConfirmedGameSummary_sourceFileId_fkey" FOREIGN KEY ("sourceFileId") REFERENCES "GameRecordFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ConfirmedGameSummary" ADD CONSTRAINT "ConfirmedGameSummary_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ConfirmedGamePlayerLine" ADD CONSTRAINT "ConfirmedGamePlayerLine_summaryId_fkey" FOREIGN KEY ("summaryId") REFERENCES "ConfirmedGameSummary"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConfirmedGamePlayerLine" ADD CONSTRAINT "ConfirmedGamePlayerLine_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
