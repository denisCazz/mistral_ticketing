import { createHash } from "node:crypto";
import { getEncoding } from "js-tiktoken";
import { DOCUMENT_EMBEDDING_PROFILE } from "@/lib/document-embedding-profile";

export type DocumentPageInput = {
  pageNumber: number | null;
  content: string;
};

export type DocumentChunkContext = {
  title: string;
  category: string;
  subcategory: string | null;
  entityLabel: string | null;
  documentDate: string | null;
  expiryDate: string | null;
};

export type PreparedDocumentChunk = {
  index: number;
  content: string;
  embeddingInput: string;
  contentHash: string;
  tokenCount: number;
  pageFrom: number | null;
  pageTo: number | null;
  sectionTitle: string | null;
};

type StructuralUnit = {
  text: string;
  tokenCount: number;
  pageNumber: number | null;
  sectionTitle: string | null;
};

const encoding = getEncoding("cl100k_base");
const HEADING =
  /^(?:[A-ZÀ-Ü0-9][A-ZÀ-Ü0-9 /'’().:-]{3,}|#{1,6}\s+.+)$/u;

function normalizeText(text: string): string {
  return text
    .replace(/\u0000/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+$/gm, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function repeatedBoundaryLines(pages: DocumentPageInput[]): Set<string> {
  const counts = new Map<string, number>();
  for (const page of pages) {
    const lines = normalizeText(page.content)
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    for (const line of new Set(
      [lines[0], lines.at(-1)].filter(
        (value): value is string => Boolean(value)
      )
    )) {
      counts.set(line, (counts.get(line) ?? 0) + 1);
    }
  }

  const minimum = Math.max(2, Math.ceil(pages.length * 0.6));
  return new Set(
    [...counts.entries()]
      .filter(([line, count]) => line.length <= 160 && count >= minimum)
      .map(([line]) => line)
  );
}

function splitOversizedText(text: string, maxTokens: number): string[] {
  const tokens = encoding.encode(text);
  if (tokens.length <= maxTokens) return [text];

  const parts: string[] = [];
  for (let start = 0; start < tokens.length; start += maxTokens) {
    const part = encoding.decode(tokens.slice(start, start + maxTokens)).trim();
    if (part) parts.push(part);
  }
  return parts;
}

function splitParagraph(paragraph: string, maxTokens: number): string[] {
  if (encoding.encode(paragraph).length <= maxTokens) return [paragraph];

  const sentences = paragraph
    .split(/(?<=[.!?])\s+(?=\S)/u)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  if (sentences.length <= 1) {
    return splitOversizedText(paragraph, maxTokens);
  }

  return sentences.flatMap((sentence) =>
    splitOversizedText(sentence, maxTokens)
  );
}

function buildStructuralUnits(pages: DocumentPageInput[]): StructuralUnit[] {
  const repeated = repeatedBoundaryLines(pages);
  const units: StructuralUnit[] = [];

  for (const page of pages) {
    const lines = normalizeText(page.content)
      .split("\n")
      .filter((line) => !repeated.has(line.trim()));
    const cleaned = lines.join("\n").trim();
    if (!cleaned) continue;

    let sectionTitle: string | null = null;
    for (const block of cleaned.split(/\n\s*\n/u)) {
      const paragraph = block.trim();
      if (!paragraph) continue;
      if (
        paragraph.length <= 160 &&
        !paragraph.includes("\n") &&
        HEADING.test(paragraph)
      ) {
        sectionTitle = paragraph.replace(/^#{1,6}\s+/u, "").trim();
        continue;
      }

      for (const text of splitParagraph(
        paragraph.replace(/\n+/g, " "),
        DOCUMENT_EMBEDDING_PROFILE.maxTokens
      )) {
        units.push({
          text,
          tokenCount: encoding.encode(text).length,
          pageNumber: page.pageNumber,
          sectionTitle,
        });
      }
    }
  }

  return units;
}

function contextualPrefix(
  context: DocumentChunkContext,
  sectionTitle: string | null,
  pageFrom: number | null,
  pageTo: number | null
): string {
  const pageLabel =
    pageFrom == null
      ? null
      : pageTo != null && pageTo !== pageFrom
        ? `Pagine: ${pageFrom}-${pageTo}`
        : `Pagina: ${pageFrom}`;
  return [
    `Documento: ${context.title}`,
    `Categoria: ${context.category}${context.subcategory ? ` / ${context.subcategory}` : ""}`,
    context.entityLabel ? `Entità: ${context.entityLabel}` : null,
    context.documentDate ? `Data documento: ${context.documentDate}` : null,
    context.expiryDate ? `Scadenza: ${context.expiryDate}` : null,
    sectionTitle ? `Sezione: ${sectionTitle}` : null,
    pageLabel,
  ]
    .filter((value): value is string => Boolean(value))
    .join("\n");
}

function trailingOverlap(
  units: StructuralUnit[],
  maxTokens: number
): StructuralUnit[] {
  const overlap: StructuralUnit[] = [];
  let total = 0;
  for (let index = units.length - 1; index >= 0; index -= 1) {
    const unit = units[index];
    if (overlap.length > 0 && total + unit.tokenCount > maxTokens) break;
    if (unit.tokenCount > maxTokens) break;
    overlap.unshift(unit);
    total += unit.tokenCount;
  }
  return overlap;
}

export function buildDocumentChunks(input: {
  pages: DocumentPageInput[];
  context: DocumentChunkContext;
}): PreparedDocumentChunk[] {
  const units = buildStructuralUnits(input.pages);
  if (units.length === 0) return [];

  const groups: StructuralUnit[][] = [];
  let current: StructuralUnit[] = [];
  let currentTokens = 0;

  const flush = () => {
    if (current.length === 0) return;
    groups.push(current);
    current = trailingOverlap(
      current,
      DOCUMENT_EMBEDDING_PROFILE.overlapTokens
    );
    currentTokens = current.reduce((sum, unit) => sum + unit.tokenCount, 0);
  };

  for (const unit of units) {
    if (
      current.length > 0 &&
      (currentTokens >= DOCUMENT_EMBEDDING_PROFILE.targetTokens ||
        currentTokens + unit.tokenCount >
          DOCUMENT_EMBEDDING_PROFILE.maxTokens)
    ) {
      flush();
    }
    current.push(unit);
    currentTokens += unit.tokenCount;
  }
  if (current.length > 0) groups.push(current);

  return groups.map((group, index) => {
    const content = group.map((unit) => unit.text).join("\n\n").trim();
    const pages = group
      .map((unit) => unit.pageNumber)
      .filter((page): page is number => page != null);
    const pageFrom = pages.length > 0 ? Math.min(...pages) : null;
    const pageTo = pages.length > 0 ? Math.max(...pages) : null;
    const sections = [
      ...new Set(
        group
          .map((unit) => unit.sectionTitle)
          .filter((section): section is string => Boolean(section))
      ),
    ];
    const sectionTitle = sections.length > 0 ? sections.join(" / ") : null;
    const embeddingInput = `${contextualPrefix(
      input.context,
      sectionTitle,
      pageFrom,
      pageTo
    )}\n\n${content}`;
    const contentHash = createHash("sha256")
      .update(DOCUMENT_EMBEDDING_PROFILE.normalizationVersion)
      .update("\n")
      .update(embeddingInput)
      .digest("hex");

    return {
      index,
      content,
      embeddingInput,
      contentHash,
      tokenCount: encoding.encode(content).length,
      pageFrom,
      pageTo,
      sectionTitle,
    };
  });
}
