-- 历史误生成：在 SpeedColumn/SpeedMark 尚未创建时尝试 DROP。
-- 影子库从空库重放时表不存在；改成 IF EXISTS，空库上等价于空操作。
ALTER TABLE IF EXISTS "SpeedColumn" DROP CONSTRAINT IF EXISTS "SpeedColumn_sessionId_fkey";
ALTER TABLE IF EXISTS "SpeedMark" DROP CONSTRAINT IF EXISTS "SpeedMark_columnId_fkey";
ALTER TABLE IF EXISTS "SpeedMark" DROP CONSTRAINT IF EXISTS "SpeedMark_playerId_fkey";
ALTER TABLE IF EXISTS "SpeedMark" DROP CONSTRAINT IF EXISTS "SpeedMark_sessionId_fkey";

DROP TABLE IF EXISTS "SpeedMark";
DROP TABLE IF EXISTS "SpeedColumn";
