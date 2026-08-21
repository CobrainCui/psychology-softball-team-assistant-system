import { prisma } from "@/lib/db";

export async function loadSameTeamAccount(
  accountId: string,
  teamId: string
) {
  return prisma.account.findFirst({
    where: { id: accountId, teamId },
  });
}

export function notOnThisTeam(): { success: false; error: string } {
  return { success: false, error: "目标不在本队" };
}
