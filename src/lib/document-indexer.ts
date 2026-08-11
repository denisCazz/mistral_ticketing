import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  buildDocumentChunks,
  type DocumentChunkContext,
  type DocumentPageInput,
  type PreparedDocumentChunk,
} from "@/lib/document-chunker";
import { DOCUMENT_EMBEDDING_PROFILE } from "@/lib/document-embedding-profile";
import { embedTexts } from "@/lib/openai";
import {
  getPgvectorCapability,
  invalidatePgvectorCapability,
  isPgvectorUnavailableError,
  vectorLiteral,
  writeCentroidVector,
  writeChunkVector,
} from "@/lib/pgvector";
import { normalizedWeightedCentroid } from "@/lib/vector-math";

export type LoadedIndexDocument = {
  id: string;
  aiWhitelist: boolean;
  title: string;
  category: string;
  subcategory: string | null;
  entityLabel: string | null;
  documentDate: string | null;
  expiryDate: string | null;
  pages: DocumentPageInput[];
};

type PersistGenerationInput = {
  document: LoadedIndexDocument;
  chunks: PreparedDocumentChunk[];
  embeddings: number[][];
  centroid: number[];
  generation: string;
};

export type IndexDocumentResult = {
  documentoId: string;
  profile: string;
  version: string;
  chunkCount: number;
  tokenCount: number;
  vectorMode: "pgvector" | "json";
};

export type IndexerDependencies = {
  loadDocument(documentoId: string): Promise<LoadedIndexDocument | null>;
  embed(texts: string[]): Promise<{ embeddings: number[][]; tokens: number }>;
  persistAndActivate(
    input: PersistGenerationInput
  ): Promise<"pgvector" | "json">;
  markIndexing(documentoId: string): Promise<void>;
  markFailed(documentoId: string, error: string): Promise<void>;
};

function assertEmbeddings(
  chunks: PreparedDocumentChunk[],
  embeddings: number[][]
): void {
  if (embeddings.length !== chunks.length) {
    throw new Error(
      `numero embedding non valido: ${embeddings.length}, atteso ${chunks.length}`
    );
  }
  for (const embedding of embeddings) {
    vectorLiteral(embedding, DOCUMENT_EMBEDDING_PROFILE.dimensions);
  }
}

export function createDocumentIndexer(deps: IndexerDependencies): {
  index(documentoId: string): Promise<IndexDocumentResult>;
} {
  return {
    async index(documentoId) {
      let tokenCount = 0;
      try {
        const document = await deps.loadDocument(documentoId);
        if (!document) throw new Error("Documento non trovato");
        if (!document.aiWhitelist) {
          throw new Error("Documento non in whitelist AI");
        }

        await deps.markIndexing(documentoId);
        const context: DocumentChunkContext = {
          title: document.title,
          category: document.category,
          subcategory: document.subcategory,
          entityLabel: document.entityLabel,
          documentDate: document.documentDate,
          expiryDate: document.expiryDate,
        };
        const chunks = buildDocumentChunks({
          pages: document.pages,
          context,
        });
        if (chunks.length === 0) {
          throw new Error("Documento senza testo indicizzabile");
        }

        const embedded = await deps.embed(
          chunks.map((chunk) => chunk.embeddingInput)
        );
        tokenCount = embedded.tokens;
        assertEmbeddings(chunks, embedded.embeddings);
        const centroid = normalizedWeightedCentroid(
          embedded.embeddings.map((vector, index) => ({
            vector,
            weight: Math.max(
              0.25,
              Math.min(1, chunks[index].tokenCount / 200)
            ),
          }))
        );
        const generation = randomUUID();
        const vectorMode = await deps.persistAndActivate({
          document,
          chunks,
          embeddings: embedded.embeddings,
          centroid,
          generation,
        });

        return {
          documentoId,
          profile: DOCUMENT_EMBEDDING_PROFILE.version,
          version: generation,
          chunkCount: chunks.length,
          tokenCount,
          vectorMode,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await deps.markFailed(documentoId, message);
        throw error;
      }
    },
  };
}

function dateOnly(value: Date | null): string | null {
  return value?.toISOString().slice(0, 10) ?? null;
}

async function loadDocument(
  documentoId: string
): Promise<LoadedIndexDocument | null> {
  const document = await prisma.documento.findUnique({
    where: { id: documentoId },
    select: {
      id: true,
      aiWhitelist: true,
      titoloOriginale: true,
      categoria: true,
      sottocategoria: true,
      dataDocumento: true,
      dataScadenza: true,
      extractedText: true,
      testi: {
        select: { pageNumber: true, content: true },
        orderBy: [{ pageNumber: "asc" }, { createdAt: "asc" }],
      },
      dipendente: { select: { nome: true, cognome: true } },
      automezzo: { select: { targa: true } },
    },
  });
  if (!document) return null;

  const entityLabel = document.dipendente
    ? `${document.dipendente.nome} ${document.dipendente.cognome}`.trim()
    : (document.automezzo?.targa ?? null);
  const pages =
    document.testi.length > 0
      ? document.testi
      : document.extractedText
        ? [{ pageNumber: null, content: document.extractedText }]
        : [];

  return {
    id: document.id,
    aiWhitelist: document.aiWhitelist,
    title: document.titoloOriginale,
    category: document.categoria,
    subcategory: document.sottocategoria,
    entityLabel,
    documentDate: dateOnly(document.dataDocumento),
    expiryDate: dateOnly(document.dataScadenza),
    pages,
  };
}

async function embedInBatches(
  texts: string[]
): Promise<{ embeddings: number[][]; tokens: number }> {
  const embeddings: number[][] = [];
  let tokens = 0;
  for (let start = 0; start < texts.length; start += 64) {
    const batch = await embedTexts(texts.slice(start, start + 64), {
      model: DOCUMENT_EMBEDDING_PROFILE.model,
      dimensions: DOCUMENT_EMBEDDING_PROFILE.dimensions,
    });
    embeddings.push(...batch.embeddings);
    tokens += batch.tokens;
  }
  return { embeddings, tokens };
}

async function persistGeneration(
  input: PersistGenerationInput,
  usePgvector: boolean
): Promise<void> {
  await prisma.$transaction(
    async (tx) => {
      const createdChunks: Array<{ id: string; vector: number[] }> = [];
      for (let index = 0; index < input.chunks.length; index += 1) {
        const chunk = input.chunks[index];
        const vector = input.embeddings[index];
        const created = await tx.documentoChunk.create({
          data: {
            documentoId: input.document.id,
            content: chunk.content,
            embedding: vector as Prisma.InputJsonValue,
            metadata: {
              model: DOCUMENT_EMBEDDING_PROFILE.model,
              dimensions: DOCUMENT_EMBEDDING_PROFILE.dimensions,
              pageFrom: chunk.pageFrom,
              pageTo: chunk.pageTo,
              sectionTitle: chunk.sectionTitle,
            },
            embeddingProfile: DOCUMENT_EMBEDDING_PROFILE.version,
            embeddingVersion: input.generation,
            chunkIndex: chunk.index,
            contentHash: chunk.contentHash,
            tokenCount: chunk.tokenCount,
            pageFrom: chunk.pageFrom,
            pageTo: chunk.pageTo,
            sectionTitle: chunk.sectionTitle,
          },
          select: { id: true },
        });
        createdChunks.push({ id: created.id, vector });
      }

      const documentEmbedding = await tx.documentoEmbedding.create({
        data: {
          documentoId: input.document.id,
          embeddingProfile: DOCUMENT_EMBEDDING_PROFILE.version,
          embeddingVersion: input.generation,
          centroid: input.centroid as Prisma.InputJsonValue,
          model: DOCUMENT_EMBEDDING_PROFILE.model,
          dimensions: DOCUMENT_EMBEDDING_PROFILE.dimensions,
          chunkCount: input.chunks.length,
        },
        select: { id: true },
      });

      if (usePgvector) {
        for (const chunk of createdChunks) {
          await writeChunkVector(tx, chunk.id, chunk.vector);
        }
        await writeCentroidVector(
          tx,
          documentEmbedding.id,
          input.centroid
        );
      }

      await tx.documento.update({
        where: { id: input.document.id },
        data: {
          embeddingDesiredVersion: DOCUMENT_EMBEDDING_PROFILE.version,
          embeddingActiveProfile: DOCUMENT_EMBEDDING_PROFILE.version,
          embeddingActiveVersion: input.generation,
          embeddingStatus: "READY",
          embeddingIndexedAt: new Date(),
          embeddingLastError: null,
          statoIngestione: "READY",
        },
      });
    },
    { timeout: 60_000 }
  );
}

async function persistAndActivate(
  input: PersistGenerationInput
): Promise<"pgvector" | "json"> {
  const capability = await getPgvectorCapability();
  if (capability.available) {
    try {
      await persistGeneration(input, true);
      return "pgvector";
    } catch (error) {
      if (!isPgvectorUnavailableError(error)) throw error;
      invalidatePgvectorCapability();
    }
  }

  await persistGeneration(input, false);
  return "json";
}

const productionIndexer = createDocumentIndexer({
  loadDocument,
  embed: embedInBatches,
  persistAndActivate,
  markIndexing: async (documentoId) => {
    await prisma.documento.update({
      where: { id: documentoId },
      data: {
        embeddingDesiredVersion: DOCUMENT_EMBEDDING_PROFILE.version,
        embeddingStatus: "INDEXING",
        embeddingLastError: null,
      },
    });
  },
  markFailed: async (documentoId, error) => {
    await prisma.documento
      .update({
        where: { id: documentoId },
        data: {
          embeddingStatus: "FAILED",
          embeddingLastError: error.slice(0, 4000),
        },
      })
      .catch(() => undefined);
  },
});

export async function indexDocumento(
  documentoId: string
): Promise<IndexDocumentResult> {
  const result = await productionIndexer.index(documentoId);
  const { refreshDocumentSimilarities } = await import(
    "@/lib/document-similarity"
  );
  await refreshDocumentSimilarities(documentoId).catch((error) => {
    console.error("Aggiornamento similarità documento fallito:", error);
  });
  return result;
}
