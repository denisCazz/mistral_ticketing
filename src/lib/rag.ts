import { prisma } from "@/lib/db";
import { OPENAI_EMBEDDING_MODEL } from "@/lib/config";

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function parseEmbedding(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null;
  const nums = value.map((v) => Number(v)).filter((n) => Number.isFinite(n));
  return nums.length ? nums : null;
}

const SEARCH_STOP_WORDS = new Set([
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
  "parla",
  "parlano",
  "per",
  "qual",
  "quale",
  "quali",
  "quando",
  "sono",
  "sui",
  "sul",
  "una",
]);

function normalizeSearchText(text: string): string {
  return text
    .toLocaleLowerCase("it")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function queryTerms(query?: string): string[] {
  if (!query) return [];
  return [
    ...new Set(
      normalizeSearchText(query)
        .split(/\s+/)
        .filter((term) => term.length >= 3 && !SEARCH_STOP_WORDS.has(term))
    ),
  ];
}

function lexicalRelevance(
  terms: string[],
  title: string,
  content: string
): number {
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

export async function searchSimilarChunks(
  embedding: number[],
  limit = 8,
  query?: string
): Promise<
  Array<{
    id: string;
    documentoId: string;
    content: string;
    titolo: string;
    similarity: number;
    relevance: number;
  }>
> {
  const batchSize = 500;
  const candidatePoolSize = Math.max(limit * 8, 64);
  let cursor: string | undefined;
  let ranked: Array<{
    id: string;
    documentoId: string;
    content: string;
    titolo: string;
    similarity: number;
    relevance: number;
  }> = [];
  const terms = queryTerms(query);

  // Gli embedding sono JSON, quindi la similarità viene calcolata in memoria.
  // Scorriamo tutti i chunk a blocchi: un semplice `take` favorirebbe i primi
  // documenti inseriti, escludendo fonti potenzialmente molto più pertinenti.
  while (true) {
    const chunks = await prisma.documentoChunk.findMany({
      where: {
        documento: {
          is: {
            aiWhitelist: true,
            statoIngestione: "READY",
          },
        },
      },
      select: {
        id: true,
        documentoId: true,
        content: true,
        embedding: true,
        documento: { select: { titoloOriginale: true } },
      },
      orderBy: { id: "asc" },
      take: batchSize,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    if (chunks.length === 0) break;

    const batchRanked = chunks
      .map((c) => {
        const vec = parseEmbedding(c.embedding);
        if (!vec) return null;
        return {
          id: c.id,
          documentoId: c.documentoId,
          content: c.content,
          titolo: c.documento.titoloOriginale,
          similarity: cosineSimilarity(embedding, vec),
          relevance: 0,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .map((result) => {
        const lexical = lexicalRelevance(
          terms,
          result.titolo,
          result.content
        );
        return {
          ...result,
          relevance:
            terms.length > 0
              ? result.similarity * 0.75 + lexical * 0.25
              : result.similarity,
        };
      });

    ranked = [...ranked, ...batchRanked]
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, candidatePoolSize);

    if (chunks.length < batchSize) break;
    cursor = chunks[chunks.length - 1].id;
  }

  return ranked.slice(0, limit);
}

export async function upsertChunkEmbedding(
  chunkId: string,
  embedding: number[]
): Promise<void> {
  await prisma.documentoChunk.update({
    where: { id: chunkId },
    data: { embedding },
  });
}

export async function indexDocumentoChunks(documentoId: string): Promise<number> {
  const doc = await prisma.documento.findUnique({
    where: { id: documentoId },
    include: { testi: true },
  });
  if (!doc || !doc.aiWhitelist) return 0;

  const fullText =
    doc.extractedText ?? doc.testi.map((t) => t.content).join("\n\n");
  if (!fullText.trim()) return 0;

  await prisma.documentoChunk.deleteMany({ where: { documentoId } });

  const chunks = chunkText(fullText, 3200, 400);
  const { embedTexts } = await import("@/lib/openai");
  const { embeddings } = await embedTexts(chunks);

  for (let i = 0; i < chunks.length; i++) {
    await prisma.documentoChunk.create({
      data: {
        documentoId,
        content: chunks[i],
        embedding: embeddings[i],
        metadata: {
          index: i,
          model: OPENAI_EMBEDDING_MODEL,
          dimensions: embeddings[i].length,
        },
      },
    });
  }

  await prisma.documento.update({
    where: { id: documentoId },
    data: { statoIngestione: "READY" },
  });

  return chunks.length;
}

export function chunkText(
  text: string,
  size = 3200,
  overlap = 400
): string[] {
  const parts: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + size, text.length);
    if (end < text.length) {
      const paragraphBreak = text.lastIndexOf("\n\n", end);
      const sentenceBreak = text.lastIndexOf(". ", end);
      const preferredBreak = Math.max(paragraphBreak, sentenceBreak);
      if (preferredBreak > start + size * 0.6) {
        end = preferredBreak + (preferredBreak === sentenceBreak ? 1 : 0);
      }
    }
    const chunk = text.slice(start, end).trim();
    if (chunk) parts.push(chunk);
    if (end >= text.length) break;
    start = Math.max(start + 1, end - overlap);
  }
  return parts.length ? parts : [text];
}
