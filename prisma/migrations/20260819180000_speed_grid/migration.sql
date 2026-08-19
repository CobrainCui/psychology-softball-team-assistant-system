-- CreateTable
CREATE TABLE "SpeedColumn" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpeedColumn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpeedMark" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "columnId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "seconds" DOUBLE PRECISION NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpeedMark_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SpeedColumn_sessionId_idx" ON "SpeedColumn"("sessionId");

-- CreateIndex
CREATE INDEX "SpeedMark_sessionId_idx" ON "SpeedMark"("sessionId");

-- CreateIndex
CREATE INDEX "SpeedMark_playerId_idx" ON "SpeedMark"("playerId");

-- CreateIndex
CREATE UNIQUE INDEX "SpeedMark_columnId_playerId_key" ON "SpeedMark"("columnId", "playerId");

-- AddForeignKey
ALTER TABLE "SpeedColumn" ADD CONSTRAINT "SpeedColumn_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "TestSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpeedMark" ADD CONSTRAINT "SpeedMark_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "TestSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpeedMark" ADD CONSTRAINT "SpeedMark_columnId_fkey" FOREIGN KEY ("columnId") REFERENCES "SpeedColumn"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpeedMark" ADD CONSTRAINT "SpeedMark_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
