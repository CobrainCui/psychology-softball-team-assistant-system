// 测试报名排阵：相对上次提交的增删差，生成 push 风格修改记录。

import type { Assignments } from "@/lib/sessionDraft";

export type AssignmentPair = { playerId: string; testItem: string };

export interface AssignmentCommit {
  id: string;
  author: string;
  note?: string;
  summary: string;
  added: AssignmentPair[];
  removed: AssignmentPair[];
  timestamp: number;
}

export function cloneAssignments(assignments: Assignments): Assignments {
  const next: Assignments = {};
  for (const [playerId, items] of Object.entries(assignments)) {
    if (Array.isArray(items) && items.length > 0) {
      next[playerId] = [...items];
    }
  }
  return next;
}

function collectPairs(assignments: Assignments): AssignmentPair[] {
  const pairs: AssignmentPair[] = [];
  for (const [playerId, items] of Object.entries(assignments)) {
    if (!Array.isArray(items)) continue;
    for (const testItem of items) {
      if (typeof testItem === "string" && testItem.length > 0) {
        pairs.push({ playerId, testItem });
      }
    }
  }
  return pairs;
}

function pairKey(pair: AssignmentPair): string {
  return `${pair.playerId}\0${pair.testItem}`;
}

export function diffAssignments(
  before: Assignments,
  after: Assignments
): { added: AssignmentPair[]; removed: AssignmentPair[] } {
  const beforeMap = new Map(
    collectPairs(before).map((pair) => [pairKey(pair), pair])
  );
  const afterMap = new Map(
    collectPairs(after).map((pair) => [pairKey(pair), pair])
  );

  const added: AssignmentPair[] = [];
  for (const [key, pair] of afterMap) {
    if (!beforeMap.has(key)) added.push(pair);
  }
  const removed: AssignmentPair[] = [];
  for (const [key, pair] of beforeMap) {
    if (!afterMap.has(key)) removed.push(pair);
  }
  return { added, removed };
}

export function formatAssignmentPair(
  pair: AssignmentPair,
  players: { id: string; name: string }[]
): string {
  const name =
    players.find((player) => player.id === pair.playerId)?.name ?? pair.playerId;
  return `${name}→${pair.testItem}`;
}

// 推导步骤：首次保存用「测试报名」；之后用「测试报名修改」+ 添加/删除 + 可选备注
export function buildAssignmentCommitSummary(input: {
  author: string;
  isRevision: boolean;
  added: AssignmentPair[];
  removed: AssignmentPair[];
  note?: string;
  players: { id: string; name: string }[];
}): string {
  const addText = input.added.length
    ? `添加 ${input.added.map((pair) => formatAssignmentPair(pair, input.players)).join("、")}`
    : "";
  const removeText = input.removed.length
    ? `删除 ${input.removed.map((pair) => formatAssignmentPair(pair, input.players)).join("、")}`
    : "";
  const changeParts = [addText, removeText].filter(Boolean);
  const changeText = changeParts.length > 0 ? `，${changeParts.join("，")}` : "";
  const noteText = input.note ? `，备注：${input.note}` : "";
  const verb = input.isRevision ? "进行了一次测试报名修改" : "进行了一次测试报名";
  return `${input.author}${verb}${changeText}${noteText}`;
}

export function isAssignmentCommit(value: unknown): value is AssignmentCommit {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === "string" &&
    typeof row.author === "string" &&
    typeof row.summary === "string" &&
    typeof row.timestamp === "number" &&
    Array.isArray(row.added) &&
    Array.isArray(row.removed)
  );
}
