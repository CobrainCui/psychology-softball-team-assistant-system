import { prisma } from "@/lib/db";

const DEFAULT_TEAM_NAME = "心理学部队";

export async function getOrCreateDefaultTeam() {
  let team = await prisma.team.findFirst({ orderBy: { createdAt: "asc" } });
  if (!team) {
    team = await prisma.team.create({
      data: { name: DEFAULT_TEAM_NAME },
    });
  }
  return team;
}

export async function ensureDefaultTeam() {
  return getOrCreateDefaultTeam();
}
