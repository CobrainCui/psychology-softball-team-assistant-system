-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('male', 'female');

-- CreateEnum
CREATE TYPE "PlayerRole" AS ENUM ('player', 'coach');

-- CreateEnum
CREATE TYPE "HitResult" AS ENUM ('LD', 'FB', 'GB', 'PU', 'MISS');

-- CreateEnum
CREATE TYPE "PitchType" AS ENUM ('FB', 'CB', 'SL', 'CH', 'OT');

-- CreateEnum
CREATE TYPE "HitQuality" AS ENUM ('Hard', 'Medium', 'Soft');

-- CreateEnum
CREATE TYPE "PainArea" AS ENUM ('shoulder', 'elbow', 'lumbar', 'knee', 'ankle', 'wrist');

-- CreateEnum
CREATE TYPE "ProbeFeedback" AS ENUM ('A', 'B', 'C');

-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Player" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "gender" "Gender",
    "role" "PlayerRole" NOT NULL DEFAULT 'player',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Player_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TestSession" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "archivedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TestSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Hit" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "result" "HitResult" NOT NULL,
    "x" DOUBLE PRECISION,
    "y" DOUBLE PRECISION,
    "pitchType" "PitchType",
    "hitQuality" "HitQuality",
    "recordedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Hit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpeedRecord" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "firstBaseSeconds" DOUBLE PRECISION,
    "secondBaseSeconds" DOUBLE PRECISION,
    "customSeconds" DOUBLE PRECISION,
    "recordedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpeedRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReadinessCheck" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "readinessScore" INTEGER NOT NULL,
    "hasNewInjury" BOOLEAN NOT NULL DEFAULT false,
    "injuryPart" "PainArea",
    "injuryScore" INTEGER NOT NULL DEFAULT 0,
    "probeFeedback" "ProbeFeedback",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReadinessCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InjuryLog" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "painArea" "PainArea" NOT NULL,
    "painScore" INTEGER NOT NULL,
    "symptom" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InjuryLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Player_teamId_idx" ON "Player"("teamId");

-- CreateIndex
CREATE INDEX "Player_name_idx" ON "Player"("name");

-- CreateIndex
CREATE INDEX "TestSession_teamId_archivedAt_idx" ON "TestSession"("teamId", "archivedAt");

-- CreateIndex
CREATE INDEX "Hit_sessionId_idx" ON "Hit"("sessionId");

-- CreateIndex
CREATE INDEX "Hit_playerId_idx" ON "Hit"("playerId");

-- CreateIndex
CREATE INDEX "SpeedRecord_sessionId_idx" ON "SpeedRecord"("sessionId");

-- CreateIndex
CREATE INDEX "SpeedRecord_playerId_idx" ON "SpeedRecord"("playerId");

-- CreateIndex
CREATE INDEX "ReadinessCheck_playerId_date_idx" ON "ReadinessCheck"("playerId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "ReadinessCheck_playerId_date_key" ON "ReadinessCheck"("playerId", "date");

-- CreateIndex
CREATE INDEX "InjuryLog_playerId_createdAt_idx" ON "InjuryLog"("playerId", "createdAt");

-- AddForeignKey
ALTER TABLE "Player" ADD CONSTRAINT "Player_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TestSession" ADD CONSTRAINT "TestSession_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Hit" ADD CONSTRAINT "Hit_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "TestSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Hit" ADD CONSTRAINT "Hit_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpeedRecord" ADD CONSTRAINT "SpeedRecord_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "TestSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpeedRecord" ADD CONSTRAINT "SpeedRecord_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReadinessCheck" ADD CONSTRAINT "ReadinessCheck_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InjuryLog" ADD CONSTRAINT "InjuryLog_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;
