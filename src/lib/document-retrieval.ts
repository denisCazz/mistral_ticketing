import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  DOCUMENTI_HR_CATEGORIE,
  documentiHrWhere,
} from "@/lib/access";
import {
  getPgvectorCapability,
  invalidatePgvectorCapability,
  isPgvectorUnavailableError,
  vectorLiteral,
} from "@/lib/pgvector";
import {
  cosineSimilarity,
  reciprocalRankFusion,
} from "@/lib/vector-math";

export type DocumentSearchScope = {
  canAccessHr: boolean;
};

export type DocumentSearchChunk = {
  id: string;
  documentoId: string;
  content: string;
  titolo: string;
  similarity: number;
  relevance: number;
};

export type DocumentSearchResponse = {
  chunks: DocumentSearchChunk[];
  mode: "pgvector" | "json";
};

type AuthorizedCandidate = {
  entityType: string;
  categoria: string;
};

export function filterAuthorizedCandidates<T extends AuthorizedCandidate>(
  rows: T[],
  scope: DocumentSearchScope
): T[] {
  if (scope.canAccessHr) return rows;
  const reserved = new Set<string>(DOCUMENTI_HR_CATEGORIE);
  return rows.filter(
    (row) =>
      row.entityType !== "DIPENDENTE" && !reserved.has(row.categoria)
  );
}

export function normalizeFusedResults<
  T extends { fusedScore: number; similarity: number },
>(rows: T[]): Array<T & { relevance: number }> {
  const maximum = Math.max(0, ...rows.map((row) => row.fusedScore));
  return rows.map((row) => ({
    ...row,
    relevance: maximum > 0 ? row.fusedScore / maximum : 0,
  }));
}

function normalizeSearchText(text: string): string {
  return text
    .toLocaleLowerCase("it")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const STOP_WORDS = new Set([
  "che",
  "chi",
  "come",
  "cosa",
  "dei",
  "del",
  "della",
  "delle",
  "documenti",
  "dove",
  "gli",
  "nei",
  "nel",
  "nella",
  "per",
  "qual",
  "quale",
  "quali",
  "quando",
  "sono",
  "una",
]);

function lexicalScore(query: string, title: string, content: string): number {
  const terms = [
    ...new Set(
      normalizeSearchText(query)
        .split(/\s+/)
        .filter((term) => term.length >= 3 && !STOP_WORDS.has(term))
    ),
  ];
  if (terms.length === 0) return 0;

  const normalizedTitle = ` ${normalizeSearchText(title)} `;
  const normalizedContent = ` ${normalizeSearchText(content)} `;
  const score = terms.reduce((total, term) => {
    const token = ` ${term} `;
    if (normalizedTitle.includes(token)) return total + 1;
    if (normalizedContent.includes(token)) return total + 0.65;
    return total;
  }, 0);
  return Math.min(1, score / terms.length);
}

function parseEmbedding(value: unknown, dimensions: number): number[] | null {
  if (!Array.isArray(value) || value.length !== dimensions) return null;
  const vector = value.map(Number);
  return vector.every(Number.isFinite) ? vector : null;
}

type NativeRow = {
  id: string;
  documentoId: string;
  content: string;
  titolo: string;
  similarity: number;
  fusedScore: number;
};

async function searchNative(params: {
  embedding: number[];
  query: string;
  limit: number;
  scope: DocumentSearchScope;
}): Promise<DocumentSearchChunk[]> {
  const vector = vectorLiteral(params.embedding);
  const candidateLimit = Math.max(64, params.limit * 8);
  const hrFilter = params.scope.canAccessHr
    ? Prisma.empty
    : Prisma.sql`
        AND document."entityType" <> 'DIPENDENTE'::"EntityType"
        AND document.categoria NOT IN (
          ${Prisma.join([...DOCUMENTI_HR_CATEGORIE])}
        )
      `;

  const rows = await prisma.$queryRaw<NativeRow[]>(Prisma.sql`
    WITH eligible AS (
      SELECT
        chunk.id,
        chunk."documentoId",
        chunk.content,
        chunk."embeddingVector",
        document."titoloOriginale" AS titolo
      FROM "DocumentoChunk" AS chunk
      JOIN "Documento" AS document ON document.id = chunk."documentoId"
      WHERE document."canonicalDocumentoId" IS NULL
        AND document."aiWhitelist" = true
        AND document."statoIngestione" = 'READY'::"StatoIngestione"
        AND chunk."embeddingVersion" = document."embeddingActiveVersion"
        AND chunk."embeddingVector" IS NOT NULL
        ${hrFilter}
    ),
    vector_ranked AS (
      SELECT
        id,
        row_number() OVER (
          ORDER BY "embeddingVector" <=> ${vector}::vector
        ) AS rank
      FROM eligible
      ORDER BY "embeddingVector" <=> ${vector}::vector
      LIMIT ${candidateLimit}
    ),
    lexical_ranked AS (
      SELECT
        id,
        row_number() OVER (
          ORDER BY ts_rank_cd(
            to_tsvector('italian', content),
            websearch_to_tsquery('italian', ${params.query})
          ) DESC
        ) AS rank
      FROM eligible
      WHERE to_tsvector('italian', content)
        @@ websearch_to_tsquery('italian', ${params.query})
      ORDER BY ts_rank_cd(
        to_tsvector('italian', content),
        websearch_to_tsquery('italian', ${params.query})
      ) DESC
      LIMIT ${candidateLimit}
    ),
    candidates AS (
      SELECT id FROM vector_ranked
      UNION
      SELECT id FROM lexical_ranked
    )
    SELECT
      eligible.id,
      eligible."documentoId",
      eligible.content,
      eligible.titolo,
      (
        1 - (eligible."embeddingVector" <=> ${vector}::vector)
      )::double precision AS similarity,
      (
        COALESCE(1.0 / (60 + vector_ranked.rank), 0) +
        COALESCE(1.0 / (60 + lexical_ranked.rank), 0)
      )::double precision AS "fusedScore"
    FROM candidates
    JOIN eligible ON eligible.id = candidates.id
    LEFT JOIN vector_ranked ON vector_ranked.id = candidates.id
    LEFT JOIN lexical_ranked ON lexical_ranked.id = candidates.id
    ORDER BY "fusedScore" DESC, similarity DESC
    LIMIT ${candidateLimit}
  `);

  return normalizeFusedResults(rows)
    .map((row) => ({
      id: row.id,
      documentoId: row.documentoId,
      content: row.content,
      titolo: row.titolo,
      similarity: row.similarity,
      relevance: row.relevance,
    }))
    .slice(0, params.limit);
}

type FallbackCandidate = {
  id: string;
  documentoId: string;
  content: string;
  titolo: string;
  similarity: number;
  lexical: number;
};

async function searchJson(params: {
  embedding: number[];
  query: string;
  limit: number;
  scope: DocumentSearchScope;
}): Promise<DocumentSearchChunk[]> {
  const candidates: FallbackCandidate[] = [];
  let cursor: string | undefined;

  while (true) {
    const chunks = await prisma.documentoChunk.findMany({
      where: {
        embedding: { not: Prisma.DbNull },
        documento: {
          is: {
            canonicalDocumentoId: null,
            aiWhitelist: true,
            statoIngestione: "READY",
            ...documentiHrWhere(params.scope.canAccessHr),
          },
        },
      },
      select: {
        id: true,
        documentoId: true,
        content: true,
        embedding: true,
        embeddingVersion: true,
        documento: {
          select: {
            titoloOriginale: true,
            embeddingActiveVersion: true,
          },
        },
      },
      orderBy: { id: "asc" },
      take: 500,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (chunks.length === 0) break;

    for (const chunk of chunks) {
      if (chunk.embeddingVersion !== chunk.documento.embeddingActiveVersion) {
        continue;
      }
      const vector = parseEmbedding(
        chunk.embedding,
        params.embedding.length
      );
      if (!vector) continue;
      candidates.push({
        id: chunk.id,
        documentoId: chunk.documentoId,
        content: chunk.content,
        titolo: chunk.documento.titoloOriginale,
        similarity: cosineSimilarity(params.embedding, vector),
        lexical: lexicalScore(
          params.query,
          chunk.documento.titoloOriginale,
          chunk.content
        ),
      });
    }

    if (chunks.length < 500) break;
    cursor = chunks.at(-1)?.id;
  }

  const candidateLimit = Math.max(64, params.limit * 8);
  const vectorRank = [...candidates]
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, candidateLimit)
    .map((candidate) => candidate.id);
  const lexicalRank = [...candidates]
    .filter((candidate) => candidate.lexical > 0)
    .sort((a, b) => b.lexical - a.lexical)
    .slice(0, candidateLimit)
    .map((candidate) => candidate.id);
  const fused = reciprocalRankFusion(vectorRank, lexicalRank);
  const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const rows = fused
    .map((entry) => {
      const candidate = byId.get(entry.id);
      return candidate
        ? {
            ...candidate,
            fusedScore: entry.score,
          }
        : null;
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  return normalizeFusedResults(rows)
    .map((row) => ({
      id: row.id,
      documentoId: row.documentoId,
      content: row.content,
      titolo: row.titolo,
      similarity: row.similarity,
      relevance: row.relevance,
    }))
    .slice(0, params.limit);
}

export async function searchDocumentChunks(params: {
  embedding: number[];
  query: string;
  limit: number;
  scope: DocumentSearchScope;
}): Promise<DocumentSearchResponse> {
  const limit = Math.min(50, Math.max(1, params.limit));
  const normalized = { ...params, limit };
  const capability = await getPgvectorCapability();

  if (capability.available) {
    try {
      return {
        chunks: await searchNative(normalized),
        mode: "pgvector",
      };
    } catch (error) {
      if (!isPgvectorUnavailableError(error)) throw error;
      invalidatePgvectorCapability();
      console.warn("pgvector non disponibile, uso fallback JSON");
    }
  }

  return {
    chunks: await searchJson(normalized),
    mode: "json",
  };
}
