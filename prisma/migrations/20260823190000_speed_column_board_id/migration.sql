-- 盘面列 id（firstBase 等）改为每场会话内唯一；落库主键可另发
ALTER TABLE "SpeedColumn" ADD COLUMN "boardColumnId" TEXT;

UPDATE "SpeedColumn" SET "boardColumnId" = "id" WHERE "boardColumnId" IS NULL;

ALTER TABLE "SpeedColumn" ALTER COLUMN "boardColumnId" SET NOT NULL;

CREATE UNIQUE INDEX "SpeedColumn_sessionId_boardColumnId_key" ON "SpeedColumn"("sessionId", "boardColumnId");
