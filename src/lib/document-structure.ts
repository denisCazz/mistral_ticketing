import { prisma } from "@/lib/db";
import { buildHybridExtraction } from "@/lib/document-extraction";
import {
  buildAiAuditCost,
  extractDocumentFields,
  isOpenAiConfigured,
} from "@/lib/openai";
import type { Prisma } from "@prisma/client";

export type StructureDocumentResult = {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  decision?: string;
  needsReview?: boolean;
  dataScadenza?: string | null;
  dipendenteId?: string | null;
  automezzoId?: string | null;
};

/**
 * Estrazione strutturata ibrida (regex + AI) e persistenza su Documento/Scadenza.
 */
export async function structureDocumento(
  documentoId: string,
  options?: { force?: boolean; userId?: string | null }
): Promise<StructureDocumentResult> {
  if (!isOpenAiConfigured()) {
    return { ok: false, reason: "OPENAI_API_KEY mancante" };
  }

  const doc = await prisma.documento.findUnique({ where: { id: documentoId } });
  if (!doc) return { ok: false, reason: "Documento non trovato" };
  if (!doc.extractedText?.trim()) {
    return { ok: false, reason: "Testo non estratto: esegui prima extract/OCR" };
  }
  if (doc.extractionJson && !options?.force) {
    return { ok: true, skipped: true, reason: "Estrazione già presente" };
  }

  const [dipendenti, automezzi] = await Promise.all([
    prisma.dipendente.findMany({
      where: { active: true },
      select: { id: true, nome: true, cognome: true },
    }),
    prisma.automezzo.findMany({
      select: { id: true, targa: true },
    }),
  ]);

  const folderHint = [doc.categoria, doc.sottocategoria]
    .filter(Boolean)
    .join("/");

  const ai = await extractDocumentFields({
    titolo: doc.titoloOriginale,
    categoria: doc.categoria,
    sottocategoria: doc.sottocategoria,
    entityType: doc.entityType,
    text: doc.extractedText,
  });

  const hybrid = buildHybridExtraction({
    titolo: doc.titoloOriginale,
    folderHint,
    bodyText: doc.extractedText,
    aiRaw: ai.output,
    entityType: doc.entityType,
    currentDipendenteId: doc.dipendenteId,
    currentAutomezzoId: doc.automezzoId,
    dipendenti,
    automezzi,
  });

  const { applied } = hybrid;

  await prisma.documento.update({
    where: { id: doc.id },
    data: {
      extractionJson: hybrid.payload as Prisma.InputJsonValue,
      extractionAt: new Date(),
      dataScadenza: applied.nonServeScadenza ? null : applied.dataScadenza,
      dataDocumento: applied.dataDocumento ?? undefined,
      nonServeScadenza: applied.nonServeScadenza,
      scadenzaSource: applied.scadenzaSource,
      scadenzaConfidence: applied.scadenzaConfidence,
      scadenzaRaw: applied.scadenzaRaw,
      statoValidita: applied.statoValidita,
      dipendenteId: applied.dipendenteId,
      automezzoId: applied.automezzoId,
    },
  });

  if (applied.dataScadenza && !applied.nonServeScadenza) {
    const existing = await prisma.scadenza.findFirst({
      where: { documentoId: doc.id },
    });
    const scadenzaData = {
      dataScadenza: applied.dataScadenza,
      fonte: applied.scadenzaSource ?? "AI",
      confidence: applied.scadenzaConfidence,
      rawValue: applied.scadenzaRaw,
      confermata: applied.confermata,
      dipendenteId: applied.dipendenteId,
      automezzoId: applied.automezzoId,
      titolo: doc.titoloOriginale,
    };
    if (existing) {
      await prisma.scadenza.update({
        where: { id: existing.id },
        data: scadenzaData,
      });
    } else {
      await prisma.scadenza.create({
        data: {
          documentoId: doc.id,
          ...scadenzaData,
        },
      });
    }
  } else if (applied.nonServeScadenza) {
    await prisma.scadenza.deleteMany({ where: { documentoId: doc.id } });
  }

  if (options?.userId) {
    void prisma.aiGenerationAudit
      .create({
        data: {
          userId: options.userId,
          prompt: `structure:${doc.id}:${doc.titoloOriginale}`.slice(0, 2000),
          model: ai.model,
          sources: [{ documentoId: doc.id, titolo: doc.titoloOriginale }],
          outputJson: {
            type: "document_structure",
            decision: hybrid.decision,
            extraction: hybrid.extraction,
            _usage: {
              promptTokens: ai.promptTokens,
              completionTokens: ai.completionTokens,
              totalTokens: ai.totalTokens,
              estimatedCostUsd: buildAiAuditCost({
                model: ai.model,
                promptTokens: ai.promptTokens,
                completionTokens: ai.completionTokens,
                embeddingTokens: 0,
              }),
            },
          },
        },
      })
      .catch((err) => {
        console.error("AiGenerationAudit structure failed:", err);
      });
  }

  return {
    ok: true,
    decision: hybrid.decision,
    needsReview: applied.needsReview,
    dataScadenza: applied.dataScadenza
      ? applied.dataScadenza.toISOString().slice(0, 10)
      : null,
    dipendenteId: applied.dipendenteId,
    automezzoId: applied.automezzoId,
  };
}
