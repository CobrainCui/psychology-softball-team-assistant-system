// 单队试点：保证库中始终有一支默认球队；不再自动种子队员。

import { prisma } from "@/lib/db";

export const DEFAULT_TEAM_NAME = "本校满垒球队";

// 推导步骤：查是否已有球队 → 无则创建（名册留空，由登录/新建写入）
export async function ensureDefaultTeam() {
  let team = await prisma.team.findFirst({ orderBy: { createdAt: "asc" } });
  if (!team) {
    team = await prisma.team.create({
      data: { name: DEFAULT_TEAM_NAME },
    });
  }
  return team;
}
