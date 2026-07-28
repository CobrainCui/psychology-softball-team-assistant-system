-- CreateEnum
CREATE TYPE "AvailabilityStatus" AS ENUM ('full', 'modified', 'unavailable');

-- CreateTable
CREATE TABLE "AvailabilityCheck" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "date" DATE NOT NULL,
    "status" "AvailabilityStatus" NOT NULL,
    "painArea" "PainArea",
    "painScore" INTEGER NOT NULL DEFAULT 0,
    "symptom" TEXT,
    "probeFeedback" "ProbeFeedback",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AvailabilityCheck_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AvailabilityCheck_playerId_date_idx" ON "AvailabilityCheck"("playerId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "AvailabilityCheck_playerId_date_key" ON "AvailabilityCheck"("playerId", "date");

-- AddForeignKey
ALTER TABLE "AvailabilityCheck" ADD CONSTRAINT "AvailabilityCheck_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;
