import type { GameResultKind, IScoreParsed } from "@/lib/season/types";

export type IScoreParseOk = { ok: true } & IScoreParsed;
export type IScoreParseErr = { ok: false; error: string };
export type IScoreParseResult = IScoreParseOk | IScoreParseErr;

const HEADER = "ISCORE-TEXT v1";

/** 从固定文字层样本提取 (text) Tj 串 */
export function extractPdfTextLayer(pdf: Buffer): string | null {
  const raw = pdf.toString("latin1");
  if (!raw.includes("%PDF")) return null;
  const chunks: string[] = [];
  const re = /\(([^\\()]*)\)\s*Tj/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(raw))) {
    chunks.push(match[1]);
  }
  if (chunks.length === 0) return null;
  return chunks.join("\n");
}

export function parseIScorePlainText(text: string): IScoreParseResult {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines[0] !== HEADER) {
    return { ok: false, error: "无法解析：不是 ISCORE-TEXT v1 文字层" };
  }
  let date: string | null = null;
  let opponent: string | null = null;
  let ourScore: number | null = null;
  let opponentScore: number | null = null;
  let result: GameResultKind = "unknown";
  const players: { name: string; participated: boolean }[] = [];
  let inPlayers = false;
  for (const line of lines.slice(1)) {
    if (line === "PLAYERS:") {
      inPlayers = true;
      continue;
    }
    if (inPlayers) {
      const [name, flag] = line.split(",").map((s) => s.trim());
      if (!name) return { ok: false, error: "无法解析：球员行无效" };
      players.push({ name, participated: flag !== "0" });
      continue;
    }
    if (line.startsWith("DATE:")) date = line.slice(5).trim();
    else if (line.startsWith("OPPONENT:")) opponent = line.slice(9).trim() || null;
    else if (line.startsWith("SCORE:")) {
      const m = line.slice(6).trim().match(/^(\d+)\s*-\s*(\d+)$/);
      if (!m) return { ok: false, error: "无法解析：比分格式应为 8-5" };
      ourScore = Number(m[1]);
      opponentScore = Number(m[2]);
    } else if (line.startsWith("RESULT:")) {
      const value = line.slice(7).trim();
      if (value !== "win" && value !== "loss" && value !== "tie" && value !== "unknown") {
        return { ok: false, error: "无法解析：RESULT 无效" };
      }
      result = value;
    } else {
      return { ok: false, error: `无法解析：未知字段 ${line}` };
    }
  }
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { ok: false, error: "无法解析：缺少 DATE" };
  }
  return {
    ok: true,
    date,
    opponent,
    ourScore,
    opponentScore,
    result,
    players,
  };
}

export function parseIScorePdf(pdf: Buffer): IScoreParseResult {
  const text = extractPdfTextLayer(pdf);
  if (!text) return { ok: false, error: "无法解析：PDF 无文字层" };
  return parseIScorePlainText(text);
}

export function buildIScorePdf(text: string): Buffer {
  const escaped = text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  const lines = escaped.split("\n");
  let content = "BT /F1 12 Tf 72 720 Td\n";
  lines.forEach((line, i) => {
    if (i === 0) content += `(${line}) Tj\n`;
    else content += `0 -14 Td (${line}) Tj\n`;
  });
  content += "ET\n";
  const stream = content;
  const objects = [
    "1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n",
    "2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj\n",
    "3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources<< /Font<< /F1 5 0 R >> >> >>endobj\n",
    `4 0 obj<< /Length ${stream.length} >>stream\n${stream}endstream\nendobj\n`,
    "5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj\n",
  ];
  let body = "%PDF-1.1\n";
  const offsets = [0];
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(body, "latin1"));
    body += obj;
  }
  const xrefAt = Buffer.byteLength(body, "latin1");
  body += `xref\n0 6\n0000000000 65535 f \n`;
  for (let i = 1; i <= 5; i += 1) {
    body += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  body += `trailer<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF`;
  return Buffer.from(body, "latin1");
}
