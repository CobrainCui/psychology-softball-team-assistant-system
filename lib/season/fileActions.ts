"use server";

import { prisma } from "@/lib/db";
import { errorMessage, type ActionResult } from "@/lib/actionResult";
import { writeAuditLog } from "@/lib/auth/audit";
import {
  requireScheduleUploader,
  requireScheduleViewer,
  requireSeasonCleanup,
  requireSeasonEvidenceAdmin,
} from "@/lib/auth/actionGuard";
import { canManageSchedule } from "@/lib/auth/policy";
import { canUploadToEvent } from "@/lib/season/invariants";
import {
  pendingFileEventUploadError,
  pendingFileWriterError,
} from "@/lib/season/fileUploadEligibility";
import {
  deleteSeasonObject,
  headSeasonObject,
  PDF_MAX_BYTES,
  putSeasonObject,
  seasonStorageKey,
} from "@/lib/season/storage";
import type { GameFileDto } from "@/lib/season/types";

function toDto(row: {
  id: string;
  originalName: string;
  sizeBytes: number;
  uploadedAt: Date;
  uploadedById: string;
  retainEvidence: boolean;
}): GameFileDto {
  return {
    id: row.id,
    originalName: row.originalName,
    sizeBytes: row.sizeBytes,
    uploadedAt: row.uploadedAt.toISOString(),
    uploadedById: row.uploadedById,
    retainEvidence: row.retainEvidence,
  };
}

export async function listGameFiles(
  eventId: string
): Promise<ActionResult<{ files: GameFileDto[] }>> {
  try {
    const gate = await requireScheduleViewer();
    if (!gate.success) return gate;
    const files = await prisma.gameRecordFile.findMany({
      where: {
        scheduleEventId: eventId,
        teamId: gate.ctx.teamId,
        status: "ready",
        deletedAt: null,
      },
      orderBy: { uploadedAt: "desc" },
    });
    return { success: true, files: files.map(toDto) };
  } catch (error) {
    console.error("列出比赛文件失败:", error);
    return { success: false, error: errorMessage(error) };
  }
}

export async function createPendingUpload(input: {
  eventId: string;
  originalName: string;
  sizeBytes: number;
}): Promise<ActionResult<{ fileId: string; storageKey: string }>> {
  try {
    const gate = await requireScheduleUploader();
    if (!gate.success) return gate;
    if (input.sizeBytes <= 0 || input.sizeBytes > PDF_MAX_BYTES) {
      return { success: false, error: "文件大小无效或超过 20MB" };
    }
    const name = input.originalName.trim();
    if (!name.toLowerCase().endsWith(".pdf")) {
      return { success: false, error: "仅支持 PDF" };
    }
    const event = await prisma.scheduleEvent.findFirst({
      where: { id: input.eventId, teamId: gate.ctx.teamId },
      include: { season: { select: { status: true } } },
    });
    if (!event) return { success: false, error: "事件不存在" };
    if (!canUploadToEvent(event.status, event.season?.status ?? null)) {
      return { success: false, error: "当前事件不可上传文件" };
    }
    const created = await prisma.gameRecordFile.create({
      data: {
        teamId: gate.ctx.teamId,
        scheduleEventId: event.id,
        storageKey: "pending",
        originalName: name,
        mimeType: "application/pdf",
        sizeBytes: input.sizeBytes,
        uploadedById: gate.ctx.accountId,
        status: "pending",
      },
    });
    const storageKey = seasonStorageKey(gate.ctx.teamId, event.id, created.id);
    await prisma.gameRecordFile.update({
      where: { id: created.id },
      data: { storageKey },
    });
    return { success: true, fileId: created.id, storageKey };
  } catch (error) {
    console.error("创建上传失败:", error);
    return { success: false, error: errorMessage(error) };
  }
}

export async function storePendingBytes(
  fileId: string,
  bytes: Buffer
): Promise<ActionResult> {
  try {
    const gate = await requireScheduleUploader();
    if (!gate.success) return gate;
    const file = await prisma.gameRecordFile.findFirst({
      where: { id: fileId, teamId: gate.ctx.teamId, status: "pending" },
    });
    if (!file) return { success: false, error: "上传记录无效" };
    const writerErr = pendingFileWriterError(gate.ctx, file.uploadedById, "store");
    if (writerErr) return { success: false, error: writerErr };
    const eventErr = await pendingFileEventUploadError(
      gate.ctx.teamId,
      file.scheduleEventId
    );
    if (eventErr) return { success: false, error: eventErr };
    if (bytes.length > PDF_MAX_BYTES) {
      return { success: false, error: "文件超过 20MB" };
    }
    await putSeasonObject(file.storageKey, bytes, "application/pdf");
    return { success: true };
  } catch (error) {
    console.error("写入对象失败:", error);
    return { success: false, error: errorMessage(error) };
  }
}

export async function finalizeUpload(
  fileId: string
): Promise<ActionResult<{ file: GameFileDto }>> {
  try {
    const gate = await requireScheduleUploader();
    if (!gate.success) return gate;
    const file = await prisma.gameRecordFile.findFirst({
      where: { id: fileId, teamId: gate.ctx.teamId },
    });
    if (!file) return { success: false, error: "上传记录无效" };
    const writerErr = pendingFileWriterError(
      gate.ctx,
      file.uploadedById,
      "finalize"
    );
    if (writerErr) return { success: false, error: writerErr };
    const eventErr = await pendingFileEventUploadError(
      gate.ctx.teamId,
      file.scheduleEventId
    );
    if (eventErr) return { success: false, error: eventErr };
    const head = await headSeasonObject(file.storageKey);
    if (!head) return { success: false, error: "尚未收到文件内容" };
    const moved = await prisma.gameRecordFile.updateMany({
      where: { id: file.id, status: "pending", deletedAt: null },
      data: { status: "ready", sizeBytes: head.size },
    });
    if (moved.count !== 1) {
      return { success: false, error: "记录已更新，请刷新" };
    }
    const ready = await prisma.gameRecordFile.findUnique({ where: { id: file.id } });
    if (!ready) return { success: false, error: "记录已更新，请刷新" };
    return { success: true, file: toDto(ready) };
  } catch (error) {
    console.error("确认上传失败:", error);
    return { success: false, error: errorMessage(error) };
  }
}

async function isCurrentSourceFile(fileId: string): Promise<boolean> {
  const cited = await prisma.confirmedGameSummary.findFirst({
    where: {
      sourceFileId: fileId,
      status: "confirmed",
      supersededAt: null,
    },
    select: { id: true },
  });
  return Boolean(cited);
}

export async function deleteGameFile(
  fileId: string
): Promise<ActionResult> {
  try {
    const gate = await requireScheduleUploader();
    if (!gate.success) return gate;
    const file = await prisma.gameRecordFile.findFirst({
      where: { id: fileId, teamId: gate.ctx.teamId, deletedAt: null },
    });
    if (!file) return { success: false, error: "文件不存在" };
    const own = file.uploadedById === gate.ctx.accountId;
    const assist = canManageSchedule(gate.ctx);
    if (!own && !assist) return { success: false, error: "只能删除自己上传的文件" };
    if (await isCurrentSourceFile(file.id)) {
      return { success: false, error: "已被确认摘要引用的源文件不可删除" };
    }
    const moved = await prisma.gameRecordFile.updateMany({
      where: { id: file.id, deletedAt: null },
      data: { deletedAt: new Date(), deletedById: gate.ctx.accountId },
    });
    if (moved.count !== 1) return { success: false, error: "记录已更新，请刷新" };
    await deleteSeasonObject(file.storageKey);
    await writeAuditLog({
      action: "game_file_deleted",
      actorAccountId: gate.ctx.accountId,
      targetId: file.id,
    });
    return { success: true };
  } catch (error) {
    console.error("删除比赛文件失败:", error);
    return { success: false, error: errorMessage(error) };
  }
}

export async function hideEvidenceFile(
  fileId: string
): Promise<ActionResult> {
  try {
    const gate = await requireSeasonEvidenceAdmin();
    if (!gate.success) return gate;
    const file = await prisma.gameRecordFile.findFirst({
      where: { id: fileId, teamId: gate.ctx.teamId },
    });
    if (!file) return { success: false, error: "文件不存在" };
    await prisma.gameRecordFile.update({
      where: { id: file.id },
      data: {
        deletedAt: new Date(),
        deletedById: gate.ctx.accountId,
        retainEvidence: true,
      },
    });
    await writeAuditLog({
      action: "game_file_hidden",
      actorAccountId: gate.ctx.accountId,
      targetId: file.id,
    });
    return { success: true };
  } catch (error) {
    console.error("隐藏证据文件失败:", error);
    return { success: false, error: errorMessage(error) };
  }
}

export async function cleanupPendingUploads(): Promise<
  ActionResult<{ cleaned: number }>
> {
  try {
    const gate = await requireSeasonCleanup();
    if (!gate.success) return gate;
    const cutoff = new Date(Date.now() - 60 * 60 * 1000);
    const stale = await prisma.gameRecordFile.findMany({
      where: {
        teamId: gate.ctx.teamId,
        status: "pending",
        deletedAt: null,
        uploadedAt: { lt: cutoff },
      },
    });
    let cleaned = 0;
    for (const file of stale) {
      const moved = await prisma.gameRecordFile.updateMany({
        where: { id: file.id, status: "pending", deletedAt: null },
        data: {
          deletedAt: new Date(),
          deletedById: gate.ctx.accountId,
        },
      });
      if (moved.count === 1) {
        await deleteSeasonObject(file.storageKey);
        cleaned += 1;
      }
    }
    return { success: true, cleaned };
  } catch (error) {
    console.error("清理未完成上传失败:", error);
    return { success: false, error: errorMessage(error) };
  }
}

export async function getGameFileForDownload(
  fileId: string,
  evidence: boolean
): Promise<
  ActionResult<{ originalName: string; bytes: Buffer }>
> {
  try {
    const gate = evidence
      ? await requireSeasonEvidenceAdmin()
      : await requireScheduleViewer();
    if (!gate.success) return gate;
    const file = await prisma.gameRecordFile.findFirst({
      where: { id: fileId, teamId: gate.ctx.teamId },
    });
    if (!file) return { success: false, error: "文件不存在" };
    if (!evidence) {
      if (file.status !== "ready" || file.deletedAt) {
        return { success: false, error: "文件不可下载" };
      }
    } else if (!file.retainEvidence && file.deletedAt) {
      return { success: false, error: "无证据副本" };
    }
    const { readSeasonObject } = await import("@/lib/season/storage");
    const bytes = await readSeasonObject(file.storageKey);
    if (!bytes) return { success: false, error: "存储中找不到文件" };
    if (evidence) {
      await writeAuditLog({
        action: "game_file_evidence_read",
        actorAccountId: gate.ctx.accountId,
        targetId: file.id,
      });
    }
    return { success: true, originalName: file.originalName, bytes };
  } catch (error) {
    console.error("下载比赛文件失败:", error);
    return { success: false, error: errorMessage(error) };
  }
}
