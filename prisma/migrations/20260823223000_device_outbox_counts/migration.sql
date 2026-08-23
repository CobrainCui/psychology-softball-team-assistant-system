-- 设备 outbox 条数随确认事务落库，pending/failed>0 不能视为已同步
ALTER TABLE "TestDayDraftDevice" ADD COLUMN "pendingOutboxCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "TestDayDraftDevice" ADD COLUMN "failedOutboxCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "TestDayDraftDevice" ADD COLUMN "outboxReportedAt" TIMESTAMP(3);
