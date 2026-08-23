-- 跨设备归档门闩：成员上报本机 pending 并显式确认后才允许 archiveTestDayDraft
ALTER TABLE "TestDayDraftMember" ADD COLUMN "pendingOutboxCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "TestDayDraftMember" ADD COLUMN "pendingReportedAt" TIMESTAMP(3);
ALTER TABLE "TestDayDraftMember" ADD COLUMN "archiveReadyAt" TIMESTAMP(3);
