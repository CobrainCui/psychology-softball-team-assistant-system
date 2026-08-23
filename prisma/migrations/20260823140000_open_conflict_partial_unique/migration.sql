-- 同时只允许一条 open 的同格同类型冲突；已 resolved/dismissed 行可重复存在
DELETE FROM "TestDayConflict" AS c
WHERE c."reviewStatus" = 'open'
AND c.id NOT IN (
  SELECT keep.id FROM (
    SELECT DISTINCT ON ("draftId", "entityKey", "type") id
    FROM "TestDayConflict"
    WHERE "reviewStatus" = 'open'
    ORDER BY "draftId", "entityKey", "type", "createdAt" ASC, id ASC
  ) AS keep
);

CREATE UNIQUE INDEX "TestDayConflict_open_draft_entity_type_key"
ON "TestDayConflict" ("draftId", "entityKey", "type")
WHERE "reviewStatus" = 'open';
