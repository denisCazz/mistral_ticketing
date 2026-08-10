import { createHash } from "crypto";
import { readFile } from "fs/promises";
import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";
import {
  simpleParser,
  type AddressObject,
} from "mailparser";
import { OCR_MIN_TEXT_CHARS } from "@/lib/config";

export function sha256Buffer(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

export type TextExtractSource = "native" | "ocr" | "none";

export type TextExtractResult = {
  text: string | null;
  source: TextExtractSource;
  ocrTokens?: number;
};

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
  if (mimeType.startsWith("text/")) {
    return normalizeExtractedText(buf.toString("utf8").slice(0, 500000));
  }
  if (mimeType.startsWith("image/")) {
    return null;
  }
  return null;
}

/**
 * Estrazione testo con fallback OCR multimodale (PDF scansionati / immagini).
 */
export async function extractTextWithOcrFallback(params: {
  buffer: Buffer;
  mimeType: string;
  filename?: string;
  enableOcr?: boolean;
}): Promise<TextExtractResult> {
  const native = await extractTextFromBuffer(params.buffer, params.mimeType);
  const normalized = native ? normalizeExtractedText(native) : null;
  const enough =
    normalized != null && normalized.length >= OCR_MIN_TEXT_CHARS;

  if (enough) {
    return { text: normalized, source: "native" };
  }

  const canOcr =
    params.enableOcr !== false &&
    (params.mimeType.startsWith("image/") ||
      params.mimeType === "application/pdf" ||
      params.mimeType.endsWith("/pdf"));

  if (!canOcr) {
    return { text: normalized, source: normalized ? "native" : "none" };
  }

  const { isOpenAiConfigured, ocrDocumentBuffer } = await import("@/lib/openai");
  if (!isOpenAiConfigured()) {
    return { text: normalized, source: normalized ? "native" : "none" };
  }

  try {
    const ocr = await ocrDocumentBuffer({
      buffer: params.buffer,
      mimeType: params.mimeType,
      filename: params.filename,
    });
    if (ocr.text && ocr.text.length > (normalized?.length ?? 0)) {
      return {
        text: ocr.text,
        source: "ocr",
        ocrTokens: ocr.totalTokens,
      };
    }
  } catch (err) {
    console.error("OCR fallback failed:", err);
  }

  return { text: normalized, source: normalized ? "native" : "none" };
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
    webp: "image/webp",
    tif: "image/tiff",
    tiff: "image/tiff",
    txt: "text/plain",
  };
  return map[ext.toLowerCase()] ?? "application/octet-stream";
}
