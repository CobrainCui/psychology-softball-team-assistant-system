/**
 * 自定义测试契约断言。npx tsx scripts/verify-custom-tests.ts
 */
import assert from "node:assert/strict";
import {
  collectCustomTestPlayerIds,
  compactCustomTestSliceForArchive,
  createCustomGroupNote,
  customTestSliceHasContent,
  emptyCustomTestSlice,
  ensureCustomTestDefs,
  parseCustomTestSlice,
  pruneCustomTestSlice,
  upsertCustomPlayerNote,
  upsertCustomSingleNote,
} from "../lib/testDay/customTests";
import { sessionArchiveHasContent } from "../lib/testDay/archiveValidation";

const builtIn = ["T座打击", "上垒速度"] as const;

const empty = parseCustomTestSlice(null);
assert.deepEqual(empty, emptyCustomTestSlice());

const garbage = parseCustomTestSlice({ customTestDefs: [{ name: 1 }] });
assert.equal(garbage.customTestDefs.length, 0);

const defs = ensureCustomTestDefs(
  ["T座打击", "折返跑"],
  [],
  builtIn
);
assert.deepEqual(defs, [{ name: "折返跑", mode: "per_player" }]);

assert.equal(customTestSliceHasContent(emptyCustomTestSlice()), false);

let notes = upsertCustomPlayerNote([], {
  testItem: "折返跑",
  playerId: "p1",
  playerName: "张三",
  note: " 第一组 ",
  id: "n1",
  timestamp: 1,
});
assert.equal(notes[0]?.note, " 第一组 ");
notes = upsertCustomPlayerNote(notes, {
  testItem: "折返跑",
  playerId: "p1",
  playerName: "张三",
  note: "   ",
  id: "n1",
  timestamp: 2,
});
assert.equal(notes.length, 0);

const created = createCustomGroupNote([], {
  testItem: "折返跑",
  members: [{ id: "p1", name: "张三" }],
  id: "g1",
  timestamp: 1,
});
assert.equal(created.success, false);

const groupOk = createCustomGroupNote([], {
  testItem: "折返跑",
  members: [
    { id: "p1", name: "张三" },
    { id: "p2", name: "李四" },
  ],
  note: "配合",
  id: "g1",
  timestamp: 1,
});
assert.equal(groupOk.success, true);
if (!groupOk.success) throw new Error("expected group");

const overlap = createCustomGroupNote(groupOk.groups, {
  testItem: "折返跑",
  members: [
    { id: "p1", name: "张三" },
    { id: "p3", name: "王五" },
  ],
});
assert.equal(overlap.success, false);

const singles = upsertCustomSingleNote([], {
  testItem: "折返跑",
  note: "全场备注",
  id: "s1",
  timestamp: 1,
});
assert.equal(customTestSliceHasContent({
  customTestDefs: defs,
  customPlayerNotes: [],
  customGroupNotes: [],
  customSingleNotes: singles,
}), true);

const compacted = compactCustomTestSliceForArchive({
  customTestDefs: defs,
  customPlayerNotes: [
    {
      id: "n2",
      testItem: "折返跑",
      playerId: "p1",
      playerName: "张三",
      note: "   ",
      timestamp: 1,
    },
  ],
  customGroupNotes: groupOk.groups,
  customSingleNotes: singles,
});
assert.equal(compacted.customPlayerNotes.length, 0);
assert.equal(compacted.customGroupNotes.length, 1);
assert.equal(compacted.customSingleNotes.length, 1);
assert.deepEqual(collectCustomTestPlayerIds(compacted), ["p1", "p2"]);

const pruned = pruneCustomTestSlice(
  {
    customTestDefs: defs,
    customPlayerNotes: [],
    customGroupNotes: groupOk.groups,
    customSingleNotes: singles,
  },
  "折返跑"
);
assert.equal(pruned.customTestDefs.length, 0);
assert.equal(pruned.customGroupNotes.length, 0);

assert.equal(
  sessionArchiveHasContent({
    hits: [],
    speedRecords: [],
    customSingleNotes: singles,
  }),
  true
);
assert.equal(
  sessionArchiveHasContent({ hits: [], speedRecords: [] }),
  false
);

console.log("PASS custom test contract");
