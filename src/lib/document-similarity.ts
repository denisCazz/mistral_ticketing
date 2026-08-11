import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { DOCUMENT_SIMILARITY_MIN } from "@/lib/config";
import {
  getPgvectorCapability,
  isPgvectorUnavailableError,
} from "@/lib/pgvector";
import { cosineSimilarity } from "@/lib/vector-math";

export type GraphDocumentInput = {
  id: string;
  title: string;
  category: string;
  activeVersion: string;
  chunkCount: number;
  status: string;
  documentDate: string | null;
  expiryDate: string | null;
};

export type GraphEdgeInput = {
  sourceDocumentoId: string;
  targetDocumentoId: string;
  sourceVersion: string;
  targetVersion: string;
  score: number;
};

export type DocumentSimilarityGraph = {
  nodes: Array<{
    id: string;
    title: string;
    category: string;
    chunkCount: number;
    status: string;
    documentDate: string | null;
    expiryDate: string | null;
  }>;
  links: Array<{ source: string; target: string; score: number }>;
  truncated: boolean;
  vectorMode: "pgvector" | "json";
};

export function buildGraphPayload(input: {
  documents: GraphDocumentInput[];
  edges: GraphEdgeInput[];
  minSimilarity?: number;
  truncated?: boolean;
  vectorMode?: "pgvector" | "json";
}): DocumentSimilarityGraph {
  const versions = new Map(
    input.documents.map((document) => [document.id, document.activeVersion])
  );
  const selected = new Map<
    string,
    { source: string; target: string; score: number }
  >();
  const threshold = input.minSimilarity ?? 0;

  for (const edge of input.edges) {
    if (
      versions.get(edge.sourceDocumentoId) !== edge.sourceVersion ||
      versions.get(edge.targetDocumentoId) !== edge.targetVersion ||
      edge.score < threshold ||
      edge.sourceDocumentoId === edge.targetDocumentoId
    ) {
      continue;
    }
    const key = [edge.sourceDocumentoId, edge.targetDocumentoId]
      .sort()
      .join(":");
    const current = selected.get(key);
    if (!current || edge.score > current.score) {
      selected.set(key, {
        source: edge.sourceDocumentoId,
        target: edge.targetDocumentoId,
        score: edge.score,
      });
    }
  }

  return {
    nodes: input.documents.map((document) => ({
      id: document.id,
      title: document.title,
      category: document.category,
      chunkCount: document.chunkCount,
      status: document.status,
      documentDate: document.documentDate,
      expiryDate: document.expiryDate,
    })),
    links: [...selected.values()].sort((a, b) => b.score - a.score),
    truncated: input.truncated ?? false,
    vectorMode: input.vectorMode ?? "json",
  };
}

function parseVector(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null;
  const vector = value.map(Number);
  return vector.length > 0 && vector.every(Number.isFinite) ? vector : null;
}

type Neighbor = {
  targetDocumentoId: string;
  targetVersion: string;
  score: number;
};

async function nativeNeighbors(
  documentoId: string,
  minimum: number
): Promise<Neighbor[]> {
  return prisma.$queryRaw<Neighbor[]>(Prisma.sql`
    SELECT
      target_document.id AS "targetDocumentoId",
      target_document."embeddingActiveVersion" AS "targetVersion",
      (
        1 - (
          source_embedding."centroidVector"
          <=> target_embedding."centroidVector"
        )
      )::double precision AS score
    FROM "Documento" AS source_document
    JOIN "DocumentoEmbedding" AS source_embedding
      ON source_embedding."documentoId" = source_document.id
      AND source_embedding."embeddingVersion" =
        source_document."embeddingActiveVersion"
    JOIN "DocumentoEmbedding" AS target_embedding
      ON target_embedding."centroidVector" IS NOT NULL
    JOIN "Documento" AS target_document
      ON target_document.id = target_embedding."documentoId"
      AND target_embedding."embeddingVersion" =
        target_document."embeddingActiveVersion"
    WHERE source_document.id = ${documentoId}
      AND source_embedding."centroidVector" IS NOT NULL
      AND target_document.id <> source_document.id
      AND target_document."canonicalDocumentoId" IS NULL
      AND target_document."aiWhitelist" = true
      AND (
        1 - (
          source_embedding."centroidVector"
          <=> target_embedding."centroidVector"
        )
      ) >= ${minimum}
    ORDER BY source_embedding."centroidVector"
      <=> target_embedding."centroidVector"
    LIMIT 5
  `);
}

async function jsonNeighbors(
  documentoId: string,
  minimum: number
): Promise<Neighbor[]> {
  const embeddings = await prisma.documentoEmbedding.findMany({
    where: {
      documento: {
        is: {
          canonicalDocumentoId: null,
          aiWhitelist: true,
          embeddingActiveVersion: { not: null },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 1000,
    select: {
      documentoId: true,
      embeddingVersion: true,
      centroid: true,
      documento: { select: { embeddingActiveVersion: true } },
    },
  });
  const active = embeddings.filter(
    (embedding) =>
      embedding.embeddingVersion ===
      embedding.documento.embeddingActiveVersion
  );
  const source = active.find(
    (embedding) => embedding.documentoId === documentoId
  );
  const sourceVector = parseVector(source?.centroid);
  if (!source || !sourceVector) return [];

  return active
    .filter((embedding) => embedding.documentoId !== documentoId)
    .map((embedding) => {
      const vector = parseVector(embedding.centroid);
      if (!vector || vector.length !== sourceVector.length) return null;
      return {
        targetDocumentoId: embedding.documentoId,
        targetVersion: embedding.embeddingVersion,
        score: cosineSimilarity(sourceVector, vector),
      };
    })
    .filter((neighbor): neighbor is Neighbor => neighbor !== null)
    .filter((neighbor) => neighbor.score >= minimum)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

export async function refreshDocumentSimilarities(
  documentoId: string
): Promise<number> {
  const source = await prisma.documento.findUnique({
    where: { id: documentoId },
    select: { embeddingActiveVersion: true },
  });
  if (!source?.embeddingActiveVersion) return 0;

  const capability = await getPgvectorCapability();
  let neighbors: Neighbor[];
  if (capability.available) {
    try {
      neighbors = await nativeNeighbors(
        documentoId,
        DOCUMENT_SIMILARITY_MIN
      );
    } catch (error) {
      if (!isPgvectorUnavailableError(error)) throw error;
      neighbors = await jsonNeighbors(
        documentoId,
        DOCUMENT_SIMILARITY_MIN
      );
    }
  } else {
    neighbors = await jsonNeighbors(documentoId, DOCUMENT_SIMILARITY_MIN);
  }

  await prisma.$transaction(async (tx) => {
    await tx.documentoSimilarity.deleteMany({
      where: { sourceDocumentoId: documentoId },
    });
    if (neighbors.length > 0) {
      await tx.documentoSimilarity.createMany({
        data: neighbors.map((neighbor) => ({
          sourceDocumentoId: documentoId,
          targetDocumentoId: neighbor.targetDocumentoId,
          sourceVersion: source.embeddingActiveVersion!,
          targetVersion: neighbor.targetVersion,
          score: neighbor.score,
        })),
      });
    }
  });
  return neighbors.length;
}

function dateOnly(value: Date | null): string | null {
  return value?.toISOString().slice(0, 10) ?? null;
}

export async function getDocumentSimilarityGraph(filters: {
  search?: string;
  categories?: string[];
  status?: string;
  dateFrom?: Date;
  dateTo?: Date;
  minSimilarity?: number;
  limit?: number;
}): Promise<DocumentSimilarityGraph> {
  const limit = Math.min(1000, Math.max(1, filters.limit ?? 500));
  const where: Prisma.DocumentoWhereInput = {
    canonicalDocumentoId: null,
    aiWhitelist: true,
    embeddingActiveVersion: { not: null },
    ...(filters.categories?.length
      ? { categoria: { in: filters.categories } }
      : {}),
    ...(filters.status
      ? {
          embeddingStatus: filters.status as
            | "PENDING"
            | "INDEXING"
            | "READY"
            | "FAILED",
        }
      : {}),
    ...(filters.dateFrom || filters.dateTo
      ? {
          dataDocumento: {
            ...(filters.dateFrom ? { gte: filters.dateFrom } : {}),
            ...(filters.dateTo ? { lte: filters.dateTo } : {}),
          },
        }
      : {}),
    ...(filters.search
      ? {
          OR: [
            {
              titoloOriginale: {
                contains: filters.search,
                mode: "insensitive",
              },
            },
            {
              categoria: {
                contains: filters.search,
                mode: "insensitive",
              },
            },
          ],
        }
      : {}),
  };
  const [total, documents, vector] = await Promise.all([
    prisma.documento.count({ where }),
    prisma.documento.findMany({
      where,
      orderBy: { embeddingIndexedAt: "desc" },
      take: limit,
      select: {
        id: true,
        titoloOriginale: true,
        categoria: true,
        embeddingActiveVersion: true,
        embeddingStatus: true,
        dataDocumento: true,
        dataScadenza: true,
        embeddingGenerations: {
          select: { embeddingVersion: true, chunkCount: true },
        },
      },
    }),
    getPgvectorCapability(),
  ]);
  const ids = documents.map((document) => document.id);
  const edges =
    ids.length > 0
      ? await prisma.documentoSimilarity.findMany({
          where: {
            sourceDocumentoId: { in: ids },
            targetDocumentoId: { in: ids },
            score: { gte: filters.minSimilarity ?? DOCUMENT_SIMILARITY_MIN },
          },
          select: {
            sourceDocumentoId: true,
            targetDocumentoId: true,
            sourceVersion: true,
            targetVersion: true,
            score: true,
          },
        })
      : [];

  return buildGraphPayload({
    documents: documents.map((document) => {
      const generation = document.embeddingGenerations.find(
        (item) =>
          item.embeddingVersion === document.embeddingActiveVersion
      );
      return {
        id: document.id,
        title: document.titoloOriginale,
        category: document.categoria,
        activeVersion: document.embeddingActiveVersion!,
        chunkCount: generation?.chunkCount ?? 0,
        status: document.embeddingStatus,
        documentDate: dateOnly(document.dataDocumento),
        expiryDate: dateOnly(document.dataScadenza),
      };
    }),
    edges,
    minSimilarity: filters.minSimilarity ?? DOCUMENT_SIMILARITY_MIN,
    truncated: total > limit,
    vectorMode: vector.available ? "pgvector" : "json",
  });
}
