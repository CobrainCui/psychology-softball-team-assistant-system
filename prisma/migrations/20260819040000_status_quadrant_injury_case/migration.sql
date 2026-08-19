-- 体察四象限 / episode 损伤：旧百分制与可用性快照不兼容，直接清空后重建列。

-- CreateEnum
CREATE TYPE "PreQuadrant" AS ENUM ('slack', 'real_fatigue', 'injury_risk', 'peak');

-- CreateEnum
CREATE TYPE "ActivityType" AS ENUM ('batting', 'throwing_defense', 'baserunning', 'conditioning', 'game', 'other');

-- CreateEnum
CREATE TYPE "InjuryKind" AS ENUM ('overuse', 'acute_strain', 'contusion', 'inflammation', 'post_care', 'unclear');

-- CreateEnum
CREATE TYPE "InjuryCaseStatus" AS ENUM ('active', 'recovered');

-- CreateEnum
CREATE TYPE "InjuryNoteKind" AS ENUM ('treatment', 'rehab');

-- AlterEnum
ALTER TYPE "PainArea" ADD VALUE 'hip';
ALTER TYPE "PainArea" ADD VALUE 'other';

-- Drop old injury / availability tables
DROP TABLE IF EXISTS "InjuryLog";
DROP TABLE IF EXISTS "AvailabilityCheck";

-- ReadinessCheck: wipe incompatible Hooper rows, then reshape
DELETE FROM "ReadinessCheck";

ALTER TABLE "ReadinessCheck" DROP COLUMN IF EXISTS "readinessScore";
ALTER TABLE "ReadinessCheck" DROP COLUMN IF EXISTS "hasNewInjury";
ALTER TABLE "ReadinessCheck" DROP COLUMN IF EXISTS "injuryPart";
ALTER TABLE "ReadinessCheck" DROP COLUMN IF EXISTS "injuryScore";
ALTER TABLE "ReadinessCheck" DROP COLUMN IF EXISTS "probeFeedback";
ALTER TABLE "ReadinessCheck" DROP COLUMN IF EXISTS "sleepQuality";
ALTER TABLE "ReadinessCheck" DROP COLUMN IF EXISTS "stressScore";
ALTER TABLE "ReadinessCheck" DROP COLUMN IF EXISTS "fatigueScore";
ALTER TABLE "ReadinessCheck" DROP COLUMN IF EXISTS "sorenessScore";

ALTER TABLE "ReadinessCheck" ADD COLUMN "sleep" INTEGER NOT NULL;
ALTER TABLE "ReadinessCheck" ADD COLUMN "stress" INTEGER NOT NULL;
ALTER TABLE "ReadinessCheck" ADD COLUMN "fatigue" INTEGER NOT NULL;
ALTER TABLE "ReadinessCheck" ADD COLUMN "soreness" INTEGER NOT NULL;
ALTER TABLE "ReadinessCheck" ADD COLUMN "willingness" INTEGER NOT NULL;
ALTER TABLE "ReadinessCheck" ADD COLUMN "physicalBattery" DOUBLE PRECISION NOT NULL;
ALTER TABLE "ReadinessCheck" ADD COLUMN "mentalDrive" INTEGER NOT NULL;
ALTER TABLE "ReadinessCheck" ADD COLUMN "quadrant" "PreQuadrant" NOT NULL;
ALTER TABLE "ReadinessCheck" ADD COLUMN "ruleVersion" TEXT NOT NULL DEFAULT 'pre_quadrant_v1';

-- SessionFeedback: backfill load, drop pain fields, allow multiple per day
ALTER TABLE "SessionFeedback" ADD COLUMN "activityType" "ActivityType" NOT NULL DEFAULT 'other';
ALTER TABLE "SessionFeedback" ADD COLUMN "sessionLoad" INTEGER;
UPDATE "SessionFeedback" SET "sessionLoad" = "sessionRpe" * "durationMin" WHERE "sessionLoad" IS NULL;
ALTER TABLE "SessionFeedback" ALTER COLUMN "sessionLoad" SET NOT NULL;
ALTER TABLE "SessionFeedback" DROP COLUMN IF EXISTS "hasPain";
ALTER TABLE "SessionFeedback" DROP COLUMN IF EXISTS "painArea";
DROP INDEX IF EXISTS "SessionFeedback_playerId_date_key";
ALTER TABLE "SessionFeedback" ALTER COLUMN "schemaVersion" SET DEFAULT 2;

-- InjuryCase family
CREATE TABLE "InjuryCase" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 2,
    "painArea" "PainArea" NOT NULL,
    "locationHint" TEXT NOT NULL DEFAULT '',
    "injuryKind" "InjuryKind" NOT NULL,
    "status" "InjuryCaseStatus" NOT NULL DEFAULT 'active',
    "startDate" DATE NOT NULL,
    "recoveredAt" DATE,
    "parentCaseId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InjuryCase_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InjuryPainLog" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "painScore" INTEGER NOT NULL,
    "painExerciseRelations" TEXT[],
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InjuryPainLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InjuryNoteRecord" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "kind" "InjuryNoteKind" NOT NULL,
    "date" DATE NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InjuryNoteRecord_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "InjuryCase_playerId_status_idx" ON "InjuryCase"("playerId", "status");
CREATE INDEX "InjuryCase_playerId_startDate_idx" ON "InjuryCase"("playerId", "startDate");
CREATE INDEX "InjuryPainLog_caseId_date_idx" ON "InjuryPainLog"("caseId", "date");
CREATE INDEX "InjuryNoteRecord_caseId_kind_idx" ON "InjuryNoteRecord"("caseId", "kind");

ALTER TABLE "InjuryCase" ADD CONSTRAINT "InjuryCase_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InjuryCase" ADD CONSTRAINT "InjuryCase_parentCaseId_fkey" FOREIGN KEY ("parentCaseId") REFERENCES "InjuryCase"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InjuryPainLog" ADD CONSTRAINT "InjuryPainLog_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "InjuryCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InjuryNoteRecord" ADD CONSTRAINT "InjuryNoteRecord_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "InjuryCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Drop unused enums
DROP TYPE IF EXISTS "AvailabilityStatus";
DROP TYPE IF EXISTS "ProbeFeedback";
DROP TYPE IF EXISTS "SleepQuality";
