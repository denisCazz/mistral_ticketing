import type { FonteScadenza, StatoValidita } from "@prisma/client";
import {
  EXTRACTION_AUTO_APPLY,
  EXTRACTION_REVIEW_MIN,
} from "@/lib/config";
import {
  decisionForConfidence,
  documentExtractionSchema,
  hasEvidenceForField,
  type DocumentExtraction,
} from "@/lib/document-extraction-schema";
import {
  matchEntities,
  type AutomezzoCandidate,
  type DipendenteCandidate,
  type EntityMatchResult,
} from "@/lib/entity-match";
import {
  parseScadenzaFromBody,
  parseScadenzaFromText,
  pickBestScadenza,
  type ParsedScadenza,
} from "@/lib/scadenza-parser";

export type HybridExtractionResult = {
  extraction: DocumentExtraction;
  scadenza: ParsedScadenza;
  entities: EntityMatchResult;
  decision: ReturnType<typeof decisionForConfidence>;
  applied: {
    dataScadenza: Date | null;
    dataDocumento: Date | null;
    nonServeScadenza: boolean;
    scadenzaSource: FonteScadenza | null;
    scadenzaConfidence: number | null;
    scadenzaRaw: string | null;
    statoValidita: StatoValidita;
    confermata: boolean;
    dipendenteId: string | null;
    automezzoId: string | null;
    needsReview: boolean;
  };
  payload: Record<string, unknown>;
};

function parseIsoDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
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

function aiScadenzaFromExtraction(
  extraction: DocumentExtraction
): ParsedScadenza {
  const date = parseIsoDate(extraction.dataScadenza);
  const hasEvidence = hasEvidenceForField(extraction, "dataScadenza");
  if (!date || !hasEvidence) {
    return {
      dataScadenza: null,
      fonte: "AI",
      confidence: 0,
      rawValue: null,
      statoValidita: "DA_REVISIONARE",
    };
  }

  let confidence = extraction.confidence;
  // Senza evidence non si arriva qui; con evidence debole riduci.
  if (extraction.evidence.filter((e) => e.field === "dataScadenza").length === 0) {
    confidence = Math.min(confidence, 0.5);
  }

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  return {
    dataScadenza: date,
    fonte: "AI",
    confidence,
    rawValue: extraction.dataScadenza,
    statoValidita: date.getTime() < today.getTime() ? "SCADUTO" : "VALIDO",
  };
}

/**
 * Combina regex filename/corpo + estrazione AI + matching anagrafiche.
 * Applica soglie: >=0.90 auto, >=0.65 revisione, sotto scarta campi rischiosi.
 */
export function buildHybridExtraction(params: {
  titolo: string;
  folderHint?: string;
  bodyText?: string | null;
  aiRaw: unknown;
  entityType: "DIPENDENTE" | "AUTOMEZZO" | "AZIENDA";
  currentDipendenteId?: string | null;
  currentAutomezzoId?: string | null;
  dipendenti: DipendenteCandidate[];
  automezzi: AutomezzoCandidate[];
}): HybridExtractionResult {
  const parsedAi = documentExtractionSchema.safeParse(params.aiRaw);
  const extraction: DocumentExtraction = parsedAi.success
    ? parsedAi.data
    : {
        documentType: "sconosciuto",
        personaNome: null,
        personaCognome: null,
        targa: null,
        enteEmettitore: null,
        numeroDocumento: null,
        tipoCorso: null,
        dataDocumento: null,
        dataRilascio: null,
        dataScadenza: null,
        nonServeScadenza: false,
        confidence: 0,
        notes: parsedAi.success
          ? null
          : `Schema AI non valido: ${parsedAi.error.issues
              .slice(0, 3)
              .map((i) => i.message)
              .join("; ")}`,
        evidence: [],
      };

  const fromFilename = parseScadenzaFromText(
    params.titolo,
    params.folderHint
  );
  const fromBody = params.bodyText
    ? parseScadenzaFromBody(params.bodyText)
    : {
        dataScadenza: null,
        fonte: "OCR" as const,
        confidence: 0,
        rawValue: null,
        statoValidita: "DA_REVISIONARE" as const,
      };
  const fromAi = aiScadenzaFromExtraction(extraction);

  // Boost se AI e regex concordano sulla stessa data
  let boostedAi = fromAi;
  if (
    fromAi.dataScadenza &&
    fromFilename.dataScadenza &&
    fromAi.dataScadenza.getTime() === fromFilename.dataScadenza.getTime()
  ) {
    boostedAi = {
      ...fromAi,
      confidence: Math.min(1, Math.max(fromAi.confidence, fromFilename.confidence) + 0.08),
    };
  } else if (
    fromAi.dataScadenza &&
    fromBody.dataScadenza &&
    fromAi.dataScadenza.getTime() === fromBody.dataScadenza.getTime()
  ) {
    boostedAi = {
      ...fromAi,
      confidence: Math.min(1, Math.max(fromAi.confidence, fromBody.confidence) + 0.1),
    };
  }

  const scadenza = pickBestScadenza(boostedAi, fromBody, fromFilename);
  const decision = decisionForConfidence(
    Math.max(extraction.confidence, scadenza.confidence)
  );

  const haystack = [params.titolo, params.bodyText ?? "", extraction.notes ?? ""]
    .filter(Boolean)
    .join("\n");

  const entities = matchEntities({
    personaNome: extraction.personaNome,
    personaCognome: extraction.personaCognome,
    targa: extraction.targa,
    haystack,
    dipendenti: params.dipendenti,
    automezzi: params.automezzi,
  });

  const canAutoDate =
    scadenza.dataScadenza != null &&
    scadenza.confidence >= EXTRACTION_AUTO_APPLY;
  const canReviewDate =
    scadenza.dataScadenza != null &&
    scadenza.confidence >= EXTRACTION_REVIEW_MIN;

  const needsReview =
    decision === "needs_review" ||
    decision === "reject" ||
    entities.ambiguousDipendente ||
    entities.ambiguousAutomezzo ||
    (canReviewDate && !canAutoDate);

  let dataScadenza: Date | null = null;
  let confermata = false;
  let statoValidita: StatoValidita = "DA_REVISIONARE";
  let nonServeScadenza = false;

  if (extraction.nonServeScadenza && extraction.confidence >= EXTRACTION_REVIEW_MIN) {
    nonServeScadenza = true;
    dataScadenza = null;
    statoValidita = "VALIDO";
    confermata = extraction.confidence >= EXTRACTION_AUTO_APPLY;
  } else if (canAutoDate || canReviewDate) {
    dataScadenza = scadenza.dataScadenza;
    statoValidita = scadenza.statoValidita;
    confermata = canAutoDate;
  }

  const dataDocumento =
    parseIsoDate(extraction.dataDocumento) ??
    parseIsoDate(extraction.dataRilascio);

  const linkDipendente =
    params.entityType === "DIPENDENTE" &&
    !params.currentDipendenteId &&
    entities.dipendenteId &&
    entities.dipendenteScore >= EXTRACTION_AUTO_APPLY &&
    !entities.ambiguousDipendente
      ? entities.dipendenteId
      : params.currentDipendenteId ?? null;

  const linkAutomezzo =
    params.entityType === "AUTOMEZZO" &&
    !params.currentAutomezzoId &&
    entities.automezzoId &&
    entities.automezzoScore >= EXTRACTION_AUTO_APPLY &&
    !entities.ambiguousAutomezzo
      ? entities.automezzoId
      : params.currentAutomezzoId ?? null;

  const applied = {
    dataScadenza,
    dataDocumento,
    nonServeScadenza,
    scadenzaSource: dataScadenza || nonServeScadenza ? scadenza.fonte : null,
    scadenzaConfidence: dataScadenza || nonServeScadenza ? scadenza.confidence : null,
    scadenzaRaw: dataScadenza
      ? scadenza.rawValue
      : nonServeScadenza
        ? "non_serve"
        : null,
    statoValidita: needsReview && !canAutoDate && !nonServeScadenza
      ? ("DA_REVISIONARE" as const)
      : statoValidita,
    confermata,
    dipendenteId: linkDipendente,
    automezzoId: linkAutomezzo,
    needsReview,
  };

  const payload = {
    version: 1,
    extraction,
    regex: {
      filename: fromFilename,
      body: fromBody,
      ai: boostedAi,
      chosen: scadenza,
    },
    entities,
    decision,
    applied: {
      ...applied,
      dataScadenza: applied.dataScadenza?.toISOString().slice(0, 10) ?? null,
      dataDocumento: applied.dataDocumento?.toISOString().slice(0, 10) ?? null,
    },
  };

  return {
    extraction,
    scadenza,
    entities,
    decision,
    applied,
    payload,
  };
}
