import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireApiApproved } from "@/lib/auth/apiGuard";
import {
  pendingFileEventUploadError,
  pendingFileWriterError,
} from "@/lib/season/fileUploadEligibility";
import {
  putSeasonObject,
  readSeasonObject,
  PDF_MAX_BYTES,
} from "@/lib/season/storage";
import {
  contentLengthExceedsLimit,
  looksLikePdf,
  SEASON_BLOB_REQUIRED_ERROR,
} from "@/lib/season/pdfGuard";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const gate = await requireApiApproved();
    if (!gate.ok) return gate.response;
    const { id } = await context.params;
    const evidence = new URL(request.url).searchParams.get("evidence") === "1";
    const file = await prisma.gameRecordFile.findFirst({
      where: { id, teamId: gate.ctx.teamId },
    });
    if (!file) {
      return NextResponse.json({ error: "文件不存在" }, { status: 404 });
    }
    if (evidence) {
      if (!gate.ctx.roles.includes("admin") || !file.retainEvidence) {
        return NextResponse.json({ error: "无权查看证据" }, { status: 403 });
      }
    } else if (file.status !== "ready" || file.deletedAt) {
      return NextResponse.json({ error: "文件不可下载" }, { status: 404 });
    }
    const bytes = await readSeasonObject(file.storageKey);
    if (!bytes) {
      return NextResponse.json({ error: "存储中找不到文件" }, { status: 404 });
    }
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(file.originalName)}"`,
      },
    });
  } catch (error) {
    console.error("[GET /api/season/files]", error);
    return NextResponse.json({ error: "下载失败" }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const gate = await requireApiApproved();
    if (!gate.ok) return gate.response;
    const { id } = await context.params;
    const file = await prisma.gameRecordFile.findFirst({
      where: { id, teamId: gate.ctx.teamId, status: "pending", deletedAt: null },
    });
    if (!file) {
      return NextResponse.json({ error: "上传记录无效" }, { status: 404 });
    }
    const writerErr = pendingFileWriterError(gate.ctx, file.uploadedById, "store");
    if (writerErr) {
      return NextResponse.json({ error: writerErr }, { status: 403 });
    }
    const eventErr = await pendingFileEventUploadError(
      gate.ctx.teamId,
      file.scheduleEventId
    );
    if (eventErr) {
      return NextResponse.json({ error: eventErr }, { status: 403 });
    }
    const declared = request.headers.get("content-length");
    if (!declared) {
      return NextResponse.json({ error: "须提供 Content-Length" }, { status: 411 });
    }
    if (contentLengthExceedsLimit(declared, PDF_MAX_BYTES)) {
      return NextResponse.json({ error: "文件超过 20MB" }, { status: 413 });
    }
    const buf = Buffer.from(await request.arrayBuffer());
    if (buf.length > PDF_MAX_BYTES) {
      return NextResponse.json({ error: "文件超过 20MB" }, { status: 413 });
    }
    if (!looksLikePdf(buf)) {
      return NextResponse.json({ error: "不是合法 PDF" }, { status: 400 });
    }
    await putSeasonObject(file.storageKey, buf, "application/pdf");
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[PUT /api/season/files]", error);
    const message = error instanceof Error ? error.message : "上传失败";
    if (message === SEASON_BLOB_REQUIRED_ERROR) {
      return NextResponse.json({ error: message }, { status: 503 });
    }
    if (message.includes("20MB")) {
      return NextResponse.json({ error: message }, { status: 413 });
    }
    return NextResponse.json({ error: "上传失败" }, { status: 500 });
  }
}
