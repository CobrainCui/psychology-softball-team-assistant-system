-- CreateEnum
CREATE TYPE "TestDayDraftStatus" AS ENUM ('open', 'frozen', 'archived');
CREATE TYPE "TestDayEntryKind" AS ENUM (
  'hit',
  'fly_catch',
  'speed_mark',
  'strike_cell',
  'throw_play',
  'custom_player_note',
  'custom_group_note',
  'custom_single_note'
);
CREATE TYPE "TestDayEntryStatus" AS ENUM ('active', 'tombstoned');
CREATE TYPE "TestDayConflictType" AS ENUM ('value_mismatch', 'structure', 'delete_request');
CREATE TYPE "TestDayConflictReviewStatus" AS ENUM ('open', 'resolved', 'dismissed');

-- AlterTable
ALTER TABLE "TestSession" ADD COLUMN "sourceDraftId" TEXT;

-- CreateTable
CREATE TABLE "TestDayDraft" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "status" "TestDayDraftStatus" NOT NULL DEFAULT 'open',
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "createdByAccountId" TEXT NOT NULL,
    "testItems" JSONB NOT NULL,
    "assignments" JSONB NOT NULL,
    "customTests" JSONB,
    "skillStructure" JSONB,
    "assignmentLog" JSONB,
    "version" INTEGER NOT NULL DEFAULT 1,
    "frozenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TestDayDraft_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TestDayDraftMember" (
    "id" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TestDayDraftMember_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TestDayEntry" (
    "id" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "kind" "TestDayEntryKind" NOT NULL,
    "entityKey" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "clientEntryId" TEXT NOT NULL,
    "authorAccountId" TEXT NOT NULL,
    "status" "TestDayEntryStatus" NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TestDayEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TestDayConflict" (
    "id" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "entityKey" TEXT NOT NULL,
    "type" "TestDayConflictType" NOT NULL,
    "candidateEntryIds" JSONB NOT NULL,
    "reviewStatus" "TestDayConflictReviewStatus" NOT NULL DEFAULT 'open',
    "resolvedByAccountId" TEXT,
    "finalPayload" JSONB,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TestDayConflict_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TestSession_sourceDraftId_key" ON "TestSession"("sourceDraftId");
CREATE INDEX "TestDayDraft_teamId_status_idx" ON "TestDayDraft"("teamId", "status");
CREATE INDEX "TestDayDraft_teamId_date_idx" ON "TestDayDraft"("teamId", "date");
CREATE UNIQUE INDEX "TestDayDraftMember_draftId_accountId_key" ON "TestDayDraftMember"("draftId", "accountId");
CREATE INDEX "TestDayDraftMember_accountId_idx" ON "TestDayDraftMember"("accountId");
CREATE UNIQUE INDEX "TestDayEntry_draftId_clientEntryId_key" ON "TestDayEntry"("draftId", "clientEntryId");
CREATE INDEX "TestDayEntry_draftId_entityKey_idx" ON "TestDayEntry"("draftId", "entityKey");
CREATE INDEX "TestDayEntry_draftId_status_idx" ON "TestDayEntry"("draftId", "status");
CREATE INDEX "TestDayConflict_draftId_reviewStatus_idx" ON "TestDayConflict"("draftId", "reviewStatus");
CREATE INDEX "TestDayConflict_draftId_entityKey_idx" ON "TestDayConflict"("draftId", "entityKey");

-- AddForeignKey
ALTER TABLE "TestSession" ADD CONSTRAINT "TestSession_sourceDraftId_fkey" FOREIGN KEY ("sourceDraftId") REFERENCES "TestDayDraft"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TestDayDraft" ADD CONSTRAINT "TestDayDraft_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TestDayDraft" ADD CONSTRAINT "TestDayDraft_createdByAccountId_fkey" FOREIGN KEY ("createdByAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TestDayDraftMember" ADD CONSTRAINT "TestDayDraftMember_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "TestDayDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TestDayDraftMember" ADD CONSTRAINT "TestDayDraftMember_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TestDayEntry" ADD CONSTRAINT "TestDayEntry_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "TestDayDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TestDayEntry" ADD CONSTRAINT "TestDayEntry_authorAccountId_fkey" FOREIGN KEY ("authorAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "TestDayConflict" ADD CONSTRAINT "TestDayConflict_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "TestDayDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TestDayConflict" ADD CONSTRAINT "TestDayConflict_resolvedByAccountId_fkey" FOREIGN KEY ("resolvedByAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
