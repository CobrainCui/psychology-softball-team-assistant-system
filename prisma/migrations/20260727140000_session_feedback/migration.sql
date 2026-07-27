-- CreateTable
CREATE TABLE "SessionFeedback" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "date" DATE NOT NULL,
    "sessionRpe" INTEGER NOT NULL,
    "durationMin" INTEGER NOT NULL,
    "hasPain" BOOLEAN NOT NULL DEFAULT false,
    "painArea" "PainArea",
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SessionFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SessionFeedback_playerId_date_idx" ON "SessionFeedback"("playerId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "SessionFeedback_playerId_date_key" ON "SessionFeedback"("playerId", "date");

-- AddForeignKey
ALTER TABLE "SessionFeedback" ADD CONSTRAINT "SessionFeedback_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;
