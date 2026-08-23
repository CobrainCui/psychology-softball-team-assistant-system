-- 训后反馈 v3：活动类型多选、时长停采、去掉 ActivityType 枚举。

ALTER TABLE "SessionFeedback" ADD COLUMN "activityTypes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

UPDATE "SessionFeedback"
SET "activityTypes" = CASE
  WHEN "activityType"::text = 'other' THEN ARRAY[]::TEXT[]
  ELSE ARRAY["activityType"::text]
END;

ALTER TABLE "SessionFeedback" DROP COLUMN "activityType";
ALTER TABLE "SessionFeedback" ALTER COLUMN "activityTypes" DROP DEFAULT;
ALTER TABLE "SessionFeedback" ALTER COLUMN "durationMin" DROP NOT NULL;
ALTER TABLE "SessionFeedback" ALTER COLUMN "schemaVersion" SET DEFAULT 3;

DROP TYPE "ActivityType";
