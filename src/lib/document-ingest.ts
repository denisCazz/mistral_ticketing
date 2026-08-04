import { createHash } from "crypto";
import { readFile } from "fs/promises";
import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";
import {
  simpleParser,
  type AddressObject,
} from "mailparser";

export function sha256Buffer(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

export async function extractTextFromBuffer(
  buf: Buffer,
  mimeType: string
): Promise<string | null> {
  if (mimeType === "application/pdf" || mimeType.endsWith("/pdf")) {
    try {
      const parser = new PDFParse({ data: buf });
      const result = await parser.getText();
      await parser.destroy();
      return result.text?.trim() || null;
    } catch {
      return null;
    }
  }
  if (
    mimeType ===
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    try {
      const result = await mammoth.extractRawText({ buffer: buf });
      return normalizeExtractedText(result.value);
    } catch {
      return null;
    }
  }
  if (mimeType === "message/rfc822") {
    try {
      const mail = await simpleParser(buf);
      const parts = [
        mail.subject ? `Oggetto: ${mail.subject}` : "",
        mail.from?.text ? `Da: ${mail.from.text}` : "",
        formatMailAddresses(mail.to)
          ? `A: ${formatMailAddresses(mail.to)}`
          : "",
        mail.text ?? "",
      ].filter(Boolean);
      return normalizeExtractedText(parts.join("\n\n"));
    } catch {
      return null;
    }
  }
  if (mimeType === "application/rtf" || mimeType === "text/rtf") {
    return normalizeExtractedText(extractRtfText(buf.toString("latin1")));
  }
  if (
    mimeType.startsWith("text/")
  ) {
    return normalizeExtractedText(buf.toString("utf8").slice(0, 500000));
  }
  return null;
}

function formatMailAddresses(
  value: AddressObject | AddressObject[] | undefined
): string {
  if (!value) return "";
  return (Array.isArray(value) ? value : [value])
    .map((address) => address.text)
    .filter(Boolean)
    .join(", ");
}

export function normalizeExtractedText(text: string): string | null {
  const normalized = text
    .replace(/\u0000/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return normalized.length >= 20 ? normalized : null;
}

function extractRtfText(rtf: string): string {
  return rtf
    .replace(/\\'([0-9a-fA-F]{2})/g, (_, hex: string) =>
      String.fromCharCode(parseInt(hex, 16))
    )
    .replace(/\\par[d]?/g, "\n")
    .replace(/\\tab/g, "\t")
    .replace(/\\[a-zA-Z]+-?\d* ?/g, "")
    .replace(/[{}]/g, "")
    .replace(/\\([\\{}])/g, "$1");
}

export async function readFileBuffer(path: string): Promise<Buffer> {
  return readFile(path);
}

export function mimeFromExt(ext: string): string {
  const map: Record<string, string> = {
    pdf: "application/pdf",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    rtf: "application/rtf",
    xls: "application/vnd.ms-excel",
    zip: "application/zip",
    rar: "application/x-rar-compressed",
    eml: "message/rfc822",
    bmp: "image/bmp",
  };
  return map[ext.toLowerCase()] ?? "application/octet-stream";
}
