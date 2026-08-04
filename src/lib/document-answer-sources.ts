export interface RankedDocumentChunk {
  documentoId: string;
  content: string;
  titolo: string;
  similarity: number;
}

export interface DocumentAnswerSource {
  index: number;
  documentoId: string;
  titolo: string;
  content: string;
  excerpt: string;
  similarity: number;
}

const EXCERPT_STOP_WORDS = new Set([
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

function normalize(text: string): string {
  return text
    .toLocaleLowerCase("it")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

function excerptTerms(question: string): string[] {
  return [
    ...new Set(
      normalize(question)
        .split(/[^a-z0-9]+/)
        .filter((term) => term.length >= 3 && !EXCERPT_STOP_WORDS.has(term))
    ),
  ];
}

export function relevantExcerpt(
  content: string,
  question: string,
  maxLength = 280
): string {
  const compact = content.replace(/\s+/g, " ").trim();
  if (compact.length <= maxLength) return compact;

  const normalized = normalize(compact);
  const positions = excerptTerms(question)
    .map((term) => normalized.indexOf(term))
    .filter((position) => position >= 0);
  const matchPosition = positions.length ? Math.min(...positions) : 0;

  let start = Math.max(0, matchPosition - Math.floor(maxLength * 0.35));
  let end = Math.min(compact.length, start + maxLength);

  if (start > 0) {
    const sentenceStart = Math.max(
      compact.lastIndexOf(". ", matchPosition),
      compact.lastIndexOf("; ", matchPosition),
      compact.lastIndexOf(": ", matchPosition)
    );
    start =
      sentenceStart >= Math.max(0, matchPosition - maxLength * 0.6)
        ? sentenceStart + 2
        : compact.indexOf(" ", start) + 1;
  }

  end = Math.min(compact.length, start + maxLength);
  if (end < compact.length) {
    const lastSpace = compact.lastIndexOf(" ", end);
    if (lastSpace > start) end = lastSpace;
  }

  return compact.slice(start, end).trim();
}

export function groupChunksByDocument(
  chunks: RankedDocumentChunk[],
  question: string
): DocumentAnswerSource[] {
  const grouped = new Map<
    string,
    Omit<DocumentAnswerSource, "index" | "content" | "excerpt"> & {
      chunks: string[];
    }
  >();

  for (const chunk of chunks) {
    const existing = grouped.get(chunk.documentoId);
    if (existing) {
      existing.chunks.push(chunk.content);
      existing.similarity = Math.max(existing.similarity, chunk.similarity);
      continue;
    }

    grouped.set(chunk.documentoId, {
      documentoId: chunk.documentoId,
      titolo: chunk.titolo,
      similarity: chunk.similarity,
      chunks: [chunk.content],
    });
  }

  return [...grouped.values()].map((source, position) => ({
    index: position + 1,
    documentoId: source.documentoId,
    titolo: source.titolo,
    content: source.chunks.join("\n\n--- Estratto aggiuntivo dello stesso documento ---\n\n"),
    excerpt: relevantExcerpt(source.chunks[0], question),
    similarity: source.similarity,
  }));
}
