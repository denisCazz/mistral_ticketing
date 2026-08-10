import { z } from "zod";
import {
  EXTRACTION_AUTO_APPLY,
  EXTRACTION_REVIEW_MIN,
} from "@/lib/config";

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Data ISO YYYY-MM-DD")
  .nullable();

export const extractionEvidenceSchema = z.object({
  field: z.string().min(1),
  quote: z.string().min(1).max(500),
  page: z.number().int().positive().nullable().optional(),
});

export const documentExtractionSchema = z.object({
  documentType: z.string().min(1).max(120),
  personaNome: z.string().max(120).nullable(),
  personaCognome: z.string().max(120).nullable(),
  targa: z.string().max(20).nullable(),
  enteEmettitore: z.string().max(200).nullable(),
  numeroDocumento: z.string().max(120).nullable(),
  tipoCorso: z.string().max(200).nullable(),
  dataDocumento: isoDate,
  dataRilascio: isoDate,
  dataScadenza: isoDate,
  nonServeScadenza: z.boolean(),
  confidence: z.number().min(0).max(1),
  notes: z.string().max(1000).nullable(),
  evidence: z.array(extractionEvidenceSchema).max(20),
});

export type DocumentExtraction = z.infer<typeof documentExtractionSchema>;
export type ExtractionEvidence = z.infer<typeof extractionEvidenceSchema>;

export type ExtractionDecision =
  | "auto_apply"
  | "needs_review"
  | "reject"
  | "manual_only";

export function decisionForConfidence(confidence: number): ExtractionDecision {
  if (confidence >= EXTRACTION_AUTO_APPLY) return "auto_apply";
  if (confidence >= EXTRACTION_REVIEW_MIN) return "needs_review";
  return "reject";
}

/** JSON Schema OpenAI strict per structured outputs. */
export const DOCUMENT_EXTRACTION_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    documentType: { type: "string" },
    personaNome: { type: ["string", "null"] },
    personaCognome: { type: ["string", "null"] },
    targa: { type: ["string", "null"] },
    enteEmettitore: { type: ["string", "null"] },
    numeroDocumento: { type: ["string", "null"] },
    tipoCorso: { type: ["string", "null"] },
    dataDocumento: { type: ["string", "null"] },
    dataRilascio: { type: ["string", "null"] },
    dataScadenza: { type: ["string", "null"] },
    nonServeScadenza: { type: "boolean" },
    confidence: { type: "number" },
    notes: { type: ["string", "null"] },
    evidence: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          field: { type: "string" },
          quote: { type: "string" },
          page: { type: ["integer", "null"] },
        },
        required: ["field", "quote", "page"],
      },
    },
  },
  required: [
    "documentType",
    "personaNome",
    "personaCognome",
    "targa",
    "enteEmettitore",
    "numeroDocumento",
    "tipoCorso",
    "dataDocumento",
    "dataRilascio",
    "dataScadenza",
    "nonServeScadenza",
    "confidence",
    "notes",
    "evidence",
  ],
} as const;

export function hasEvidenceForField(
  extraction: DocumentExtraction,
  field: string
): boolean {
  return extraction.evidence.some(
    (e) => e.field === field && e.quote.trim().length > 0
  );
}
