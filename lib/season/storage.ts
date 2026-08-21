import { createHash } from "node:crypto";
import { mkdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { BlobNotFoundError, del, get, head, put } from "@vercel/blob";

const MAX_PDF_BYTES = 20 * 1024 * 1024;
const LOCAL_ROOT = path.join(process.cwd(), ".tmp", "season-blob");
const PRIVATE = { access: "private" as const };

export function seasonStorageKey(
  teamId: string,
  eventId: string,
  fileId: string
): string {
  return `${teamId}/${eventId}/${fileId}.pdf`;
}

function localPath(key: string): string {
  return path.join(LOCAL_ROOT, ...key.split("/"));
}

function blobToken(): string | undefined {
  const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  return token || undefined;
}

function useVercelBlob(): boolean {
  if (blobToken()) return true;
  return Boolean(process.env.VERCEL_OIDC_TOKEN && process.env.BLOB_STORE_ID);
}

function blobAuth(): { token?: string } {
  const token = blobToken();
  return token ? { token } : {};
}

export async function putSeasonObject(
  key: string,
  body: Buffer,
  contentType: string
): Promise<void> {
  if (body.length > MAX_PDF_BYTES) {
    throw new Error("文件超过 20MB");
  }
  if (contentType !== "application/pdf") {
    throw new Error("仅支持 PDF");
  }
  if (useVercelBlob()) {
    // 路径与库内 storageKey 对齐，禁止随机后缀；同一 pending 记录允许重传覆盖。
    await put(key, body, {
      ...PRIVATE,
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType,
      ...blobAuth(),
    });
    return;
  }
  const dest = localPath(key);
  await mkdir(path.dirname(dest), { recursive: true });
  await writeFile(dest, body);
}

export async function headSeasonObject(
  key: string
): Promise<{ size: number; contentType: string } | null> {
  if (useVercelBlob()) {
    try {
      const info = await head(key, blobAuth());
      return {
        size: info.size,
        contentType: info.contentType ?? "application/pdf",
      };
    } catch (error) {
      if (error instanceof BlobNotFoundError) return null;
      console.error("读取对象元数据失败:", error);
      throw error;
    }
  }
  try {
    const info = await stat(localPath(key));
    if (!info.isFile()) return null;
    return { size: info.size, contentType: "application/pdf" };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    console.error("读取本地对象元数据失败:", error);
    throw error;
  }
}

export async function readSeasonObject(key: string): Promise<Buffer | null> {
  if (useVercelBlob()) {
    try {
      const result = await get(key, {
        ...PRIVATE,
        useCache: false,
        ...blobAuth(),
      });
      if (!result || result.statusCode !== 200) return null;
      return Buffer.from(await new Response(result.stream).arrayBuffer());
    } catch (error) {
      if (error instanceof BlobNotFoundError) return null;
      console.error("读取对象失败:", error);
      throw error;
    }
  }
  try {
    return await readFile(localPath(key));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    console.error("读取本地对象失败:", error);
    throw error;
  }
}

export async function deleteSeasonObject(key: string): Promise<void> {
  if (useVercelBlob()) {
    await del(key, blobAuth());
    return;
  }
  try {
    await unlink(localPath(key));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    console.error("删除本地对象失败:", error);
    throw error;
  }
}

export function hashBuffer(body: Buffer): string {
  return createHash("sha256").update(body).digest("hex");
}

export const PDF_MAX_BYTES = MAX_PDF_BYTES;
