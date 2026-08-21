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
  return formatAssignmentPairs([pair], players);
}

// 推导步骤：按队员归并项目，一人多项写成「张三→接高飞、好球判断」；人与人之间用分号
export function formatAssignmentPairs(
  pairs: AssignmentPair[],
  players: { id: string; name: string }[]
): string {
  const groups: { playerId: string; items: string[] }[] = [];
  const indexByPlayer = new Map<string, number>();
  for (const pair of pairs) {
    const existing = indexByPlayer.get(pair.playerId);
    if (existing === undefined) {
      indexByPlayer.set(pair.playerId, groups.length);
      groups.push({ playerId: pair.playerId, items: [pair.testItem] });
    } else {
      groups[existing].items.push(pair.testItem);
    }
  }
  return groups
    .map((group) => {
      const name =
        players.find((player) => player.id === group.playerId)?.name ??
        group.playerId;
      return `${name}→${group.items.join("、")}`;
    })
    .join("；");
}

export function buildAssignmentCommitHeadline(
  author: string,
  isRevision: boolean
): string {
  const verb = isRevision ? "进行了一次测试报名修改" : "进行了一次测试报名";
  return `${author}${verb}`;
}

export function buildAssignmentCommitDetailLines(input: {
  added: AssignmentPair[];
  removed: AssignmentPair[];
  note?: string;
  players: { id: string; name: string }[];
}): string[] {
  const lines: string[] = [];
  if (input.added.length) {
    lines.push(`添加 ${formatAssignmentPairs(input.added, input.players)}`);
  }
  if (input.removed.length) {
    lines.push(`删除 ${formatAssignmentPairs(input.removed, input.players)}`);
  }
  if (input.note) {
    lines.push(`备注：${input.note}`);
  }
  return lines;
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
  const headline = buildAssignmentCommitHeadline(input.author, input.isRevision);
  const details = buildAssignmentCommitDetailLines(input);
  return details.length > 0 ? `${headline}，${details.join("，")}` : headline;
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
