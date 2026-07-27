-- CreateEnum
CREATE TYPE "CycleEventType" AS ENUM ('period_start', 'period_end', 'spotting', 'skip_month');

-- CreateEnum
CREATE TYPE "CycleFlowLevel" AS ENUM ('light', 'medium', 'heavy');

-- CreateEnum
CREATE TYPE "CycleSharingLevel" AS ENUM ('none', 'load_only', 'phase_label');

-- CreateEnum
CREATE TYPE "PhysiologicalLoadTag" AS ENUM ('recover_high', 'acl_caution', 'maintain', 'peak_ok', 'monitor_health');

-- CreateEnum
CREATE TYPE "CycleEnergyLevel" AS ENUM ('low', 'mid', 'high');

-- CreateEnum
CREATE TYPE "CycleMoodLevel" AS ENUM ('steady', 'irritable', 'low');

-- CreateEnum
CREATE TYPE "CycleConfidence" AS ENUM ('low', 'medium', 'high');

-- CreateEnum
CREATE TYPE "CyclePhaseCode" AS ENUM ('menstrual', 'follicular', 'ovulation', 'luteal', 'late_luteal');

-- AlterTable
ALTER TABLE "ReadinessCheck" ADD COLUMN     "cycleDay" INTEGER,
ADD COLUMN     "cyclePhaseCode" "CyclePhaseCode",
ADD COLUMN     "cycleConfidence" "CycleConfidence",
ADD COLUMN     "physiologicalLoadTag" "PhysiologicalLoadTag",
ADD COLUMN     "crampsScore" INTEGER,
ADD COLUMN     "cycleEnergy" "CycleEnergyLevel",
ADD COLUMN     "cycleMood" "CycleMoodLevel",
ADD COLUMN     "cycleIrregularFlag" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "CycleProfile" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "trackingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "sharingLevel" "CycleSharingLevel" NOT NULL DEFAULT 'none',
    "typicalLengthDays" INTEGER,
    "hormonalContraception" BOOLEAN NOT NULL DEFAULT false,
    "bodyImageAnxietyOptIn" BOOLEAN NOT NULL DEFAULT false,
    "consentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CycleProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CycleEvent" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "eventType" "CycleEventType" NOT NULL,
    "date" DATE NOT NULL,
    "flowLevel" "CycleFlowLevel",
    "crampsScore" INTEGER,
    "energyLevel" "CycleEnergyLevel",
    "moodLevel" "CycleMoodLevel",
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CycleEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CycleProfile_playerId_key" ON "CycleProfile"("playerId");

-- CreateIndex
CREATE INDEX "CycleEvent_playerId_date_idx" ON "CycleEvent"("playerId", "date");

-- CreateIndex
CREATE INDEX "CycleEvent_playerId_eventType_date_idx" ON "CycleEvent"("playerId", "eventType", "date");

-- AddForeignKey
ALTER TABLE "CycleProfile" ADD CONSTRAINT "CycleProfile_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CycleEvent" ADD CONSTRAINT "CycleEvent_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;
