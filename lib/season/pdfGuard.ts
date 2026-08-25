// PDF 上传闸：先看 Content-Length，再核实际字节与 %PDF 头。生产禁止落本地盘。

const PDF_MAGIC = Buffer.from("%PDF");

export function contentLengthExceedsLimit(
  contentLengthHeader: string | null,
  maxBytes: number
): boolean {
  if (!contentLengthHeader) return false;
  const n = Number(contentLengthHeader);
  return Number.isFinite(n) && n > maxBytes;
}

export function looksLikePdf(body: Buffer): boolean {
  return body.length >= PDF_MAGIC.length && body.subarray(0, 4).equals(PDF_MAGIC);
}

export function seasonLocalDiskAllowed(
  env: NodeJS.ProcessEnv | Record<string, string | undefined>
): boolean {
  if (env.VERCEL) return false;
  if (env.NODE_ENV === "production") return false;
  return true;
}

export const SEASON_BLOB_REQUIRED_ERROR = "生产环境未配置对象存储，无法保存 PDF";
