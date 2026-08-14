import type { Session } from "next-auth";
import { prisma } from "@/lib/db";
import {
  embedText,
  generatePreventivoDraft,
  buildAiAuditCost,
} from "@/lib/openai";
import { OPENAI_CHAT_MODEL } from "@/lib/config";
import { canAccessDocumentiHr } from "@/lib/access";
import { retrieveForAi, entityContextLine } from "@/lib/document-ai-retrieve";
import { loadPreventivoGrounding } from "@/lib/preventivo-ai-grounding";
import { relevantExcerpt } from "@/lib/document-answer-sources";

export type PreventivoAiRun = {
  bozza: {
    introduzione: string;
    condizioni: string;
    righe: Array<{
      descrizione: string;
      quantita: number;
      prezzoUnitario: number;
      scontoPercentuale: number;
      aliquotaIva: number;
    }>;
  };
  fonti: Array<{
    documentoId: string;
    titolo: string;
    excerpt: string;
    similarity: number;
  }>;
};

export async function runPreventivoAiGeneration(params: {
  session: Session;
  prompt: string;
  clienteId: string | null;
  preventivoId?: string;
}): Promise<PreventivoAiRun> {
  const cliente = params.clienteId
    ? await prisma.cliente.findUnique({ where: { id: params.clienteId } })
    : null;
  if (params.clienteId && !cliente) {
    throw new Error("Cliente non trovato");
  }

  const clienteInfo = cliente
    ? [
        cliente.ragioneSociale,
        cliente.indirizzo,
        cliente.citta,
        cliente.email,
        cliente.cellulare,
      ]
        .filter(Boolean)
        .join("\n")
    : "Cliente non ancora specificato";

  const embedded = await embedText(params.prompt);
  const retrieval = await retrieveForAi({
    query: params.prompt,
    embedding: embedded.embedding,
    limit: 8,
    scope: { canAccessHr: canAccessDocumentiHr(params.session) },
    clienteId: params.clienteId,
  });
  const grounding = await loadPreventivoGrounding(params.clienteId);
  const contesto = entityContextLine(retrieval.entities);

  const draft = await generatePreventivoDraft({
    prompt: params.prompt,
    clienteInfo,
    groundingText: [contesto, grounding].filter(Boolean).join("\n\n"),
    contextChunks: retrieval.chunks.map((chunk) => ({
      content: chunk.content,
      documentoId: chunk.documentoId,
      titolo: chunk.titolo,
    })),
  });

  const model = draft.model || OPENAI_CHAT_MODEL;
  const estimatedCostUsd = buildAiAuditCost({
    model,
    promptTokens: draft.promptTokens,
    completionTokens: draft.completionTokens,
    embeddingTokens: embedded.tokens,
  });
  const sources = retrieval.chunks.map((chunk) => ({
    documentoId: chunk.documentoId,
    titolo: chunk.titolo,
    similarity: chunk.similarity,
  }));

  void prisma.aiGenerationAudit
    .create({
      data: {
        ...(params.preventivoId
          ? { preventivoId: params.preventivoId }
          : {}),
        userId: params.session.user!.id!,
        prompt: params.prompt,
        model,
        sources,
        outputJson: {
          ...draft.output,
          _usage: {
            promptTokens: draft.promptTokens,
            completionTokens: draft.completionTokens,
            embeddingTokens: embedded.tokens,
            totalTokens: draft.totalTokens + embedded.tokens,
            estimatedCostUsd,
            retrievalMode: retrieval.mode,
            usedFilters: retrieval.usedFilters,
            entities: retrieval.entities,
          },
        },
      },
    })
    .catch((error) => {
      console.error(
        "AiGenerationAudit create failed (bozza già restituita):",
        error
      );
    });

  return {
    bozza: draft.output,
    fonti: retrieval.chunks.map((chunk) => ({
      documentoId: chunk.documentoId,
      titolo: chunk.titolo,
      excerpt: relevantExcerpt(chunk.content, params.prompt),
      similarity: chunk.similarity,
    })),
  };
}
