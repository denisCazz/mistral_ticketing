import type { FonteScadenza, StatoValidita } from "@prisma/client";
import { documentExtractionSchema } from "@/lib/document-extraction-schema";
import {
  parseScadenzaFromBody,
  parseScadenzaFromText,
  pickBestScadenza,
  type ParsedScadenza,
} from "@/lib/scadenza-parser";

export const FONTE_SCADENZA_LABELS: Record<FonteScadenza, string> = {
  AI: "AI",
  FILENAME: "titolo",
  OCR: "testo",
  FOLDER: "cartella",
  MANUALE: "manuale",
};

const EMPTY: ParsedScadenza = {
  dataScadenza: null,
  fonte: "MANUALE",
  confidence: 0,
  rawValue: null,
  statoValidita: "DA_REVISIONARE",
};

const FONTI: FonteScadenza[] = ["AI", "FILENAME", "OCR", "FOLDER", "MANUALE"];

export type ScadenzaSuggestion = {
  suggestedScadenza: string | null;
  suggestedConfidence: number;
  suggestedRaw: string | null;
  suggestedSource: FonteScadenza | null;
  suggestedEvidence: string | null;
  suggestedNonServe: boolean;
  hasAiExtraction: boolean;
  canEnqueueAi: boolean;
};

export function isoDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function reviveDate(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Date(
      Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate())
    );
  }
  if (typeof value !== "string") return null;
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (
    date.getUTCFullYear() !== y ||
    date.getUTCMonth() !== mo - 1 ||
    date.getUTCDate() !== d
  ) {
    return null;
  }
  return date;
}

function asFonte(value: unknown): FonteScadenza | null {
  return typeof value === "string" && FONTI.includes(value as FonteScadenza)
    ? (value as FonteScadenza)
    : null;
}

function reviveParsed(raw: unknown, fallback: FonteScadenza): ParsedScadenza | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const date = reviveDate(o.dataScadenza);
  if (!date) return null;
  const confidence = Number(o.confidence);
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  return {
    dataScadenza: date,
    fonte: asFonte(o.fonte) ?? fallback,
    confidence: Number.isFinite(confidence) ? confidence : 0,
    rawValue: typeof o.rawValue === "string" ? o.rawValue : isoDateOnly(date),
    statoValidita: (o.statoValidita as StatoValidita | undefined) ??
      (date.getTime() < today.getTime() ? "SCADUTO" : "VALIDO"),
  };
}

function parsedFromAiExtraction(extractionJson: unknown): {
  parsed: ParsedScadenza | null;
  evidence: string | null;
  nonServe: boolean;
} {
  if (!extractionJson || typeof extractionJson !== "object") {
    return { parsed: null, evidence: null, nonServe: false };
  }
  const root = extractionJson as Record<string, unknown>;
  const parsedSchema = documentExtractionSchema.safeParse(root.extraction ?? root);
  if (!parsedSchema.success) {
    return { parsed: null, evidence: null, nonServe: false };
  }
  const extraction = parsedSchema.data;
  const evidence =
    extraction.evidence.find((e) => e.field === "dataScadenza")?.quote?.trim() ||
    null;
  const date = reviveDate(extraction.dataScadenza);
  if (!date) {
    return {
      parsed: null,
      evidence,
      nonServe: extraction.nonServeScadenza,
    };
  }
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  // Senza evidence resta proposta (non auto-apply): confidence sotto 0.65.
  const confidence = evidence
    ? extraction.confidence
    : Math.min(extraction.confidence, 0.64);
  return {
    parsed: {
      dataScadenza: date,
      fonte: "AI",
      confidence,
      rawValue: evidence ?? extraction.dataScadenza,
      statoValidita: date.getTime() < today.getTime() ? "SCADUTO" : "VALIDO",
    },
    evidence,
    nonServe: extraction.nonServeScadenza,
  };
}

function boostIfAgree(ai: ParsedScadenza, other: ParsedScadenza): ParsedScadenza {
  if (
    !ai.dataScadenza ||
    !other.dataScadenza ||
    ai.dataScadenza.getTime() !== other.dataScadenza.getTime()
  ) {
    return ai;
  }
  return {
    ...ai,
    confidence: Math.min(
      1,
      Math.max(ai.confidence, other.confidence) + 0.08
    ),
  };
}

/**
 * Proposta scadenza per lo scadenziario: AI (extractionJson) + regex titolo/testo.
 * Non applica nulla: solo suggerimento UI.
 */
export function proposeScadenzaForDocument(input: {
  titolo: string;
  categoria: string;
  sottocategoria?: string | null;
  extractionJson?: unknown;
  extractedText?: string | null;
  extractionAt?: Date | string | null;
}): ScadenzaSuggestion {
  const folderHint = [input.categoria, input.sottocategoria]
    .filter(Boolean)
    .join("/");
  const fromFilename = parseScadenzaFromText(input.titolo, folderHint);

  const json =
    input.extractionJson && typeof input.extractionJson === "object"
      ? (input.extractionJson as Record<string, unknown>)
      : null;
  const regex =
    json?.regex && typeof json.regex === "object"
      ? (json.regex as Record<string, unknown>)
      : null;

  const fromStoredBody = reviveParsed(regex?.body, "OCR");
  const fromStoredAi = reviveParsed(regex?.ai, "AI");
  const fromText = input.extractedText?.trim()
    ? parseScadenzaFromBody(input.extractedText)
    : null;

  const fromAiFields = parsedFromAiExtraction(json);
  const hasAiExtraction = Boolean(json?.extraction || input.extractionAt);

  let fromAi = pickBestScadenza(
    fromAiFields.parsed ?? EMPTY,
    fromStoredAi ?? EMPTY
  );
  const fromBody = pickBestScadenza(fromStoredBody ?? EMPTY, fromText ?? EMPTY);
  fromAi = boostIfAgree(fromAi, fromFilename);
  fromAi = boostIfAgree(fromAi, fromBody);

  const best = pickBestScadenza(fromAi, fromBody, fromFilename);
  const suggestedScadenza = best.dataScadenza
    ? isoDateOnly(best.dataScadenza)
    : null;

  return {
    suggestedScadenza,
    suggestedConfidence: suggestedScadenza ? best.confidence : 0,
    suggestedRaw: suggestedScadenza ? best.rawValue : null,
    suggestedSource: suggestedScadenza ? best.fonte : null,
    suggestedEvidence:
      best.fonte === "AI" ? fromAiFields.evidence : best.rawValue,
    suggestedNonServe: Boolean(
      fromAiFields.nonServe && !suggestedScadenza
    ),
    hasAiExtraction,
    canEnqueueAi: !hasAiExtraction,
  };
}
