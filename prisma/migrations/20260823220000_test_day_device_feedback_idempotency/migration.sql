-- 按设备归档确认；训后草稿幂等键
CREATE TABLE "TestDayDraftDevice" (
    "id" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archiveReadyAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TestDayDraftDevice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TestDayDraftDevice_draftId_deviceId_key" ON "TestDayDraftDevice"("draftId", "deviceId");
CREATE INDEX "TestDayDraftDevice_draftId_accountId_idx" ON "TestDayDraftDevice"("draftId", "accountId");
CREATE INDEX "TestDayDraftDevice_accountId_idx" ON "TestDayDraftDevice"("accountId");

ALTER TABLE "TestDayDraftDevice" ADD CONSTRAINT "TestDayDraftDevice_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "TestDayDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TestDayDraftDevice" ADD CONSTRAINT "TestDayDraftDevice_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SessionFeedback" ADD COLUMN "clientDraftId" TEXT;
CREATE UNIQUE INDEX "SessionFeedback_playerId_clientDraftId_key" ON "SessionFeedback"("playerId", "clientDraftId");
