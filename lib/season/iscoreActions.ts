"use server";

import { prisma } from "@/lib/db";
import { errorMessage, type ActionResult } from "@/lib/actionResult";
import { requireScheduleManager } from "@/lib/auth/actionGuard";
import { parseIScorePdf, type IScoreParseOk } from "@/lib/season/iscoreParse";
import { readSeasonObject } from "@/lib/season/storage";

export async function parseIScoreFromFile(
  fileId: string
): Promise<ActionResult<{ parsed: IScoreParseOk; fileId: string }>> {
  try {
    const gate = await requireScheduleManager();
    if (!gate.success) return gate;
    const file = await prisma.gameRecordFile.findFirst({
      where: {
        id: fileId,
        teamId: gate.ctx.teamId,
        status: "ready",
        deletedAt: null,
      },
    });
    if (!file) return { success: false, error: "文件不存在" };
    const bytes = await readSeasonObject(file.storageKey);
    if (!bytes) return { success: false, error: "存储中找不到文件" };
    const parsed = parseIScorePdf(bytes);
    if (!parsed.ok) return { success: false, error: parsed.error };
    return { success: true, parsed, fileId: file.id };
  } catch (error) {
    console.error("解析 iScore 失败:", error);
    return { success: false, error: errorMessage(error) };
  }
}
