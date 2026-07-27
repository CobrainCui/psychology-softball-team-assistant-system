-- AlterEnum
CREATE TYPE "SleepQuality" AS ENUM ('good', 'normal', 'bad');

-- AlterTable
ALTER TABLE "ReadinessCheck" ADD COLUMN     "sleepQuality" "SleepQuality",
ADD COLUMN     "stressScore" INTEGER,
ADD COLUMN     "fatigueScore" INTEGER,
ADD COLUMN     "sorenessScore" INTEGER;
