-- CreateEnum
CREATE TYPE "PitchCall" AS ENUM ('strike', 'ball');

-- CreateEnum
CREATE TYPE "ThrowBlame" AS ENUM ('thrower', 'firstBase', 'both');

-- AlterTable
ALTER TABLE "TestSession" ADD COLUMN "assignments" JSONB,
ADD COLUMN "testItems" JSONB;

-- AlterTable
ALTER TABLE "TestSession" ALTER COLUMN "schemaVersion" SET DEFAULT 2;

-- CreateTable
CREATE TABLE "FlyCatchAttempt" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "caught" BOOLEAN NOT NULL,
    "note" TEXT,
    "recordedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FlyCatchAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StrikeJudgeColumn" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "pitcherId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StrikeJudgeColumn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StrikeJudgeCell" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "columnId" TEXT NOT NULL,
    "judgeId" TEXT NOT NULL,
    "pitchCall" "PitchCall" NOT NULL,
    "swung" BOOLEAN NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StrikeJudgeCell_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ThrowPlay" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "testItem" TEXT NOT NULL,
    "throwerId" TEXT NOT NULL,
    "firstBaseId" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "blame" "ThrowBlame",
    "note" TEXT,
    "recordedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ThrowPlay_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FlyCatchAttempt_sessionId_idx" ON "FlyCatchAttempt"("sessionId");

-- CreateIndex
CREATE INDEX "FlyCatchAttempt_playerId_idx" ON "FlyCatchAttempt"("playerId");

-- CreateIndex
CREATE INDEX "StrikeJudgeColumn_sessionId_idx" ON "StrikeJudgeColumn"("sessionId");

-- CreateIndex
CREATE INDEX "StrikeJudgeColumn_pitcherId_idx" ON "StrikeJudgeColumn"("pitcherId");

-- CreateIndex
CREATE INDEX "StrikeJudgeCell_sessionId_idx" ON "StrikeJudgeCell"("sessionId");

-- CreateIndex
CREATE INDEX "StrikeJudgeCell_judgeId_idx" ON "StrikeJudgeCell"("judgeId");

-- CreateIndex
CREATE UNIQUE INDEX "StrikeJudgeCell_columnId_judgeId_key" ON "StrikeJudgeCell"("columnId", "judgeId");

-- CreateIndex
CREATE INDEX "ThrowPlay_sessionId_idx" ON "ThrowPlay"("sessionId");

-- CreateIndex
CREATE INDEX "ThrowPlay_throwerId_idx" ON "ThrowPlay"("throwerId");

-- CreateIndex
CREATE INDEX "ThrowPlay_firstBaseId_idx" ON "ThrowPlay"("firstBaseId");

-- CreateIndex
CREATE UNIQUE INDEX "ThrowPlay_sessionId_testItem_throwerId_firstBaseId_key" ON "ThrowPlay"("sessionId", "testItem", "throwerId", "firstBaseId");

-- AddForeignKey
ALTER TABLE "FlyCatchAttempt" ADD CONSTRAINT "FlyCatchAttempt_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "TestSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlyCatchAttempt" ADD CONSTRAINT "FlyCatchAttempt_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StrikeJudgeColumn" ADD CONSTRAINT "StrikeJudgeColumn_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "TestSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StrikeJudgeColumn" ADD CONSTRAINT "StrikeJudgeColumn_pitcherId_fkey" FOREIGN KEY ("pitcherId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StrikeJudgeCell" ADD CONSTRAINT "StrikeJudgeCell_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "TestSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StrikeJudgeCell" ADD CONSTRAINT "StrikeJudgeCell_columnId_fkey" FOREIGN KEY ("columnId") REFERENCES "StrikeJudgeColumn"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StrikeJudgeCell" ADD CONSTRAINT "StrikeJudgeCell_judgeId_fkey" FOREIGN KEY ("judgeId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThrowPlay" ADD CONSTRAINT "ThrowPlay_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "TestSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThrowPlay" ADD CONSTRAINT "ThrowPlay_throwerId_fkey" FOREIGN KEY ("throwerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThrowPlay" ADD CONSTRAINT "ThrowPlay_firstBaseId_fkey" FOREIGN KEY ("firstBaseId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
