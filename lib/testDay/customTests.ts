// 自定义测试文字备注：三种记录方式，写入端与归档共用。

export const CUSTOM_RECORD_MODES = [
  "per_player",
  "per_group",
  "single",
] as const;

export type CustomRecordMode = (typeof CUSTOM_RECORD_MODES)[number];

export const CUSTOM_RECORD_MODE_LABELS: Record<CustomRecordMode, string> = {
  per_player: "每人备注",
  per_group: "分组备注",
  single: "整项备注",
};

export const CUSTOM_RECORD_MODE_HINTS: Record<CustomRecordMode, string> = {
  per_player: "按排阵中的每个人各写一段",
  per_group: "把多人编成一组，每组一段",
  single: "本项只有一个大输入框",
};

export interface CustomTestDef {
  name: string;
  mode: CustomRecordMode;
}

export interface CustomPlayerNote {
  id: string;
  testItem: string;
  playerId: string;
  playerName: string;
  note: string;
  timestamp: number;
}

export interface CustomGroupNote {
  id: string;
  testItem: string;
  memberIds: string[];
  memberNames: string[];
  note: string;
  timestamp: number;
}

export interface CustomSingleNote {
  id: string;
  testItem: string;
  note: string;
  timestamp: number;
}

export type CustomTestSlice = {
  customTestDefs: CustomTestDef[];
  customPlayerNotes: CustomPlayerNote[];
  customGroupNotes: CustomGroupNote[];
  customSingleNotes: CustomSingleNote[];
};

export function emptyCustomTestSlice(): CustomTestSlice {
  return {
    customTestDefs: [],
    customPlayerNotes: [],
    customGroupNotes: [],
    customSingleNotes: [],
  };
}

/** 结构 Json 只存测试定义，备注走 Entry 以免投影重复 */
export function defsOnlyCustomTests(slice: CustomTestSlice): CustomTestSlice {
  return {
    customTestDefs: slice.customTestDefs,
    customPlayerNotes: [],
    customGroupNotes: [],
    customSingleNotes: [],
  };
}

export function isCustomRecordMode(value: unknown): value is CustomRecordMode {
  return (
    value === "per_player" || value === "per_group" || value === "single"
  );
}

export function isCustomTestDef(value: unknown): value is CustomTestDef {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.name === "string" &&
    row.name.length > 0 &&
    isCustomRecordMode(row.mode)
  );
}

export function isCustomPlayerNote(value: unknown): value is CustomPlayerNote {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === "string" &&
    typeof row.testItem === "string" &&
    typeof row.playerId === "string" &&
    typeof row.playerName === "string" &&
    typeof row.note === "string" &&
    typeof row.timestamp === "number"
  );
}

export function isCustomGroupNote(value: unknown): value is CustomGroupNote {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === "string" &&
    typeof row.testItem === "string" &&
    Array.isArray(row.memberIds) &&
    row.memberIds.every((id) => typeof id === "string") &&
    Array.isArray(row.memberNames) &&
    row.memberNames.every((name) => typeof name === "string") &&
    typeof row.note === "string" &&
    typeof row.timestamp === "number"
  );
}

export function isCustomSingleNote(value: unknown): value is CustomSingleNote {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === "string" &&
    typeof row.testItem === "string" &&
    typeof row.note === "string" &&
    typeof row.timestamp === "number"
  );
}

function filterTyped<T>(
  raw: unknown,
  guard: (value: unknown) => value is T
): T[] {
  return Array.isArray(raw) ? raw.filter(guard) : [];
}

export function parseCustomTestSlice(raw: unknown): CustomTestSlice {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return emptyCustomTestSlice();
  }
  const obj = raw as Record<string, unknown>;
  return {
    customTestDefs: filterTyped(obj.customTestDefs, isCustomTestDef),
    customPlayerNotes: filterTyped(obj.customPlayerNotes, isCustomPlayerNote),
    customGroupNotes: filterTyped(obj.customGroupNotes, isCustomGroupNote),
    customSingleNotes: filterTyped(obj.customSingleNotes, isCustomSingleNote),
  };
}

// 推导步骤：旧草稿只有名字、没有记录方式时，默认每人备注
export function ensureCustomTestDefs(
  testItems: string[],
  defs: CustomTestDef[],
  builtInItems: readonly string[]
): CustomTestDef[] {
  const builtIn = new Set(builtInItems);
  const byName = new Map<string, CustomTestDef>();
  for (const def of defs) {
    if (!builtIn.has(def.name)) byName.set(def.name, def);
  }
  const next: CustomTestDef[] = [];
  for (const item of testItems) {
    if (builtIn.has(item)) continue;
    next.push(byName.get(item) ?? { name: item, mode: "per_player" });
  }
  return next;
}

export function customTestSliceHasContent(slice: CustomTestSlice): boolean {
  return (
    slice.customPlayerNotes.some((row) => row.note.trim().length > 0) ||
    slice.customGroupNotes.some((row) => row.note.trim().length > 0) ||
    slice.customSingleNotes.some((row) => row.note.trim().length > 0)
  );
}

export function collectCustomTestPlayerIds(slice: CustomTestSlice): string[] {
  const ids = new Set<string>();
  for (const row of slice.customPlayerNotes) {
    if (row.playerId) ids.add(row.playerId);
  }
  for (const group of slice.customGroupNotes) {
    for (const memberId of group.memberIds) {
      if (memberId) ids.add(memberId);
    }
  }
  return [...ids];
}

export function pruneCustomTestSlice(
  slice: CustomTestSlice,
  testItem: string
): CustomTestSlice {
  return {
    customTestDefs: slice.customTestDefs.filter((row) => row.name !== testItem),
    customPlayerNotes: slice.customPlayerNotes.filter(
      (row) => row.testItem !== testItem
    ),
    customGroupNotes: slice.customGroupNotes.filter(
      (row) => row.testItem !== testItem
    ),
    customSingleNotes: slice.customSingleNotes.filter(
      (row) => row.testItem !== testItem
    ),
  };
}

export function compactCustomTestSliceForArchive(
  slice: CustomTestSlice
): CustomTestSlice {
  return {
    customTestDefs: slice.customTestDefs,
    customPlayerNotes: slice.customPlayerNotes.filter(
      (row) => row.note.trim().length > 0
    ),
    customGroupNotes: slice.customGroupNotes.filter(
      (row) => row.memberIds.length >= 2
    ),
    customSingleNotes: slice.customSingleNotes.filter(
      (row) => row.note.trim().length > 0
    ),
  };
}

export function customTestModeOf(
  defs: CustomTestDef[],
  name: string
): CustomRecordMode {
  return defs.find((def) => def.name === name)?.mode ?? "per_player";
}

type NoteStamp = { id?: string; timestamp?: number };

function stamp(input: NoteStamp): { id: string; timestamp: number } {
  return {
    id: input.id ?? crypto.randomUUID(),
    timestamp: input.timestamp ?? Date.now(),
  };
}

// 推导步骤：空备注从草稿去掉；有字则按 testItem+playerId upsert
export function upsertCustomPlayerNote(
  notes: CustomPlayerNote[],
  input: {
    testItem: string;
    playerId: string;
    playerName: string;
    note: string;
  } & NoteStamp
): CustomPlayerNote[] {
  const without = notes.filter(
    (row) =>
      !(row.testItem === input.testItem && row.playerId === input.playerId)
  );
  if (!input.note.trim()) return without;
  const existing = notes.find(
    (row) => row.testItem === input.testItem && row.playerId === input.playerId
  );
  return [
    ...without,
    {
      ...stamp({ id: input.id ?? existing?.id, timestamp: input.timestamp }),
      testItem: input.testItem,
      playerId: input.playerId,
      playerName: input.playerName,
      note: input.note,
    },
  ];
}

export function createCustomGroupNote(
  groups: CustomGroupNote[],
  input: {
    testItem: string;
    members: { id: string; name: string }[];
    note?: string;
  } & NoteStamp
): { success: true; groups: CustomGroupNote[] } | { success: false; error: string } {
  const members = input.members.filter((member) => member.id.length > 0);
  if (members.length < 2) {
    return { success: false, error: "一组至少两名队员。" };
  }
  const taken = new Set(
    groups
      .filter((group) => group.testItem === input.testItem)
      .flatMap((group) => group.memberIds)
  );
  if (members.some((member) => taken.has(member.id))) {
    return { success: false, error: "有队员已在本组测试的其他组中。" };
  }
  return {
    success: true,
    groups: [
      ...groups,
      {
        ...stamp(input),
        testItem: input.testItem,
        memberIds: members.map((member) => member.id),
        memberNames: members.map((member) => member.name),
        note: input.note ?? "",
      },
    ],
  };
}

export function updateCustomGroupNote(
  groups: CustomGroupNote[],
  groupId: string,
  note: string
): CustomGroupNote[] {
  return groups.map((group) =>
    group.id === groupId
      ? { ...group, note, timestamp: Date.now() }
      : group
  );
}

export function deleteCustomGroupNote(
  groups: CustomGroupNote[],
  groupId: string
): CustomGroupNote[] {
  return groups.filter((group) => group.id !== groupId);
}

// 推导步骤：整项一条备注；清空则从草稿删除
export function upsertCustomSingleNote(
  notes: CustomSingleNote[],
  input: { testItem: string; note: string } & NoteStamp
): CustomSingleNote[] {
  const without = notes.filter((row) => row.testItem !== input.testItem);
  if (!input.note.trim()) return without;
  const existing = notes.find((row) => row.testItem === input.testItem);
  return [
    ...without,
    {
      ...stamp({ id: input.id ?? existing?.id, timestamp: input.timestamp }),
      testItem: input.testItem,
      note: input.note,
    },
  ];
}
