import "dotenv/config";

import path from "node:path";
import { access, readFile } from "node:fs/promises";
import { prisma } from "../src/lib/db";
import { extractTextWithOcrFallback } from "../src/lib/document-ingest";
import { downloadFromR2, isR2Configured } from "../src/lib/r2";
import { indexDocumentoChunks } from "../src/lib/rag";
import { isOpenAiConfigured } from "../src/lib/openai";
import { structureDocumento } from "../src/lib/document-structure";

type Mode = "extract" | "embed" | "structure" | "all";

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, value = "true"] = arg.replace(/^--/, "").split("=", 2);
    return [key, value];
  })
);

const mode = (args.get("mode") ?? "all") as Mode;
const limit = Math.max(1, Number(args.get("limit") ?? "10000"));
const force = args.get("force") === "true";
const dryRun = args.get("dry-run") === "true";
const enableOcr = args.get("ocr") !== "false";
const enableStructure = args.get("structure") !== "false";
const sourceRoot = path.resolve(
  process.env.DOCUMENTI_SOURCE_PATH ??
    path.join(
      process.env.HOME ?? "",
      "Desktop",
      "documenti Mistral Impianti"
    )
);

if (!["extract", "embed", "structure", "all"].includes(mode)) {
  throw new Error(
    "Usa --mode=extract|embed|structure|all"
  );
}

interface Report {
  found: number;
  extracted: number;
  ocr: number;
  structured: number;
  structureReview: number;
  embedded: number;
  skipped: number;
  review: number;
  failed: number;
  chunks: number;
  estimatedEmbeddingTokens: number;
  errors: Array<{ id: string; title: string; error: string }>;
}

const report: Report = {
  found: 0,
  extracted: 0,
  ocr: 0,
  structured: 0,
  structureReview: 0,
  embedded: 0,
  skipped: 0,
  review: 0,
  failed: 0,
  chunks: 0,
  estimatedEmbeddingTokens: 0,
  errors: [],
};

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function loadDocumentBuffer(documento: {
  storageKey: string;
  sourcePath: string | null;
}): Promise<Buffer> {
  if (documento.sourcePath) {
    const candidate = path.resolve(sourceRoot, documento.sourcePath);
    const isInsideSource =
      candidate === sourceRoot ||
      candidate.startsWith(`${sourceRoot}${path.sep}`);
    if (isInsideSource && (await fileExists(candidate))) {
      return readFile(candidate);
    }
  }

  if (isR2Configured()) {
    return downloadFromR2(documento.storageKey);
  }

  throw new Error(
    "File non trovato localmente e R2 non disponibile. Configura DOCUMENTI_SOURCE_PATH."
  );
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(new Error(`Timeout ${label} dopo ${timeoutMs / 1000}s`)),
          timeoutMs
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function retry<T>(
  operation: () => Promise<T>,
  attempts = 3
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await new Promise((resolve) =>
          setTimeout(resolve, 1000 * 2 ** (attempt - 1))
        );
      }
    }
  }
  throw lastError;
}

async function extractDocument(documento: {
  id: string;
  titoloOriginale: string;
  mimeType: string;
  storageKey: string;
  sourcePath: string | null;
  extractedText: string | null;
}): Promise<string | null> {
  if (documento.extractedText && !force) {
    report.skipped++;
    return documento.extractedText;
  }

  const buffer = await loadDocumentBuffer(documento);
  const extracted = await withTimeout(
    extractTextWithOcrFallback({
      buffer,
      mimeType: documento.mimeType,
      filename: documento.titoloOriginale,
      enableOcr,
    }),
    180_000,
    documento.titoloOriginale
  );
  const normalized = extracted.text;

  if (extracted.source === "ocr") report.ocr++;

  if (!normalized) {
    report.review++;
    if (!dryRun) {
      await prisma.documento.update({
        where: { id: documento.id },
        data: {
          statoIngestione: "DA_REVISIONARE",
          extractedText: null,
        },
      });
    }
    return null;
  }

  if (!dryRun) {
    await retry(async () => {
      await prisma.documento.update({
        where: { id: documento.id },
        data: {
          extractedText: normalized,
          statoIngestione: "READY",
        },
      });
      await prisma.documentoTesto.deleteMany({
        where: { documentoId: documento.id },
      });
      await prisma.documentoTesto.create({
        data: {
          documentoId: documento.id,
          content: normalized,
        },
      });
    });
  }

  report.extracted++;
  return normalized;
}

async function structureDocument(documento: {
  id: string;
  extractedText: string | null;
  extractionJson: unknown;
}): Promise<void> {
  if (!enableStructure) {
    report.skipped++;
    return;
  }
  if (!documento.extractedText) {
    report.skipped++;
    return;
  }
  if (documento.extractionJson && !force) {
    report.skipped++;
    return;
  }
  if (dryRun) {
    report.structured++;
    return;
  }

  const result = await structureDocumento(documento.id, { force });
  if (!result.ok) {
    throw new Error(result.reason ?? "structure failed");
  }
  if (result.skipped) {
    report.skipped++;
    return;
  }
  report.structured++;
  if (result.needsReview) report.structureReview++;
}

async function embedDocument(documento: {
  id: string;
  aiWhitelist: boolean;
  extractedText: string | null;
  _count: { chunks: number };
}): Promise<void> {
  if (!documento.aiWhitelist || !documento.extractedText) {
    report.skipped++;
    return;
  }
  if (documento._count.chunks > 0 && !force) {
    report.skipped++;
    return;
  }
  if (dryRun) {
    report.embedded++;
    report.estimatedEmbeddingTokens += Math.ceil(
      documento.extractedText.length / 4
    );
    return;
  }

  const chunkCount = await retry(() => indexDocumentoChunks(documento.id));
  report.embedded++;
  report.chunks += chunkCount;
  report.estimatedEmbeddingTokens += Math.ceil(
    documento.extractedText.length / 4
  );
}

async function main() {
  const needsOpenAi =
    mode === "embed" ||
    mode === "structure" ||
    (mode === "all" && enableStructure);
  if (needsOpenAi && !isOpenAiConfigured()) {
    throw new Error("OPENAI_API_KEY mancante");
  }

  const documents = await prisma.documento.findMany({
    where: { canonicalDocumentoId: null },
    orderBy: { createdAt: "asc" },
    take: limit,
    include: { _count: { select: { chunks: true } } },
  });
  report.found = documents.length;

  if (documents.length === 0) {
    console.log(
      "Nessun documento nel DB. Esegui prima: npm run import:documenti:dry && npm run import:documenti"
    );
    return;
  }

  console.log(
    `Processo ${documents.length} documenti; mode=${mode}; force=${force}; dryRun=${dryRun}; ocr=${enableOcr}; structure=${enableStructure}`
  );

  for (let i = 0; i < documents.length; i++) {
    const documento = documents[i];
    try {
      let extractedText = documento.extractedText;

      if (mode === "extract" || mode === "all") {
        extractedText = await extractDocument(documento);
      }

      if (mode === "structure" || mode === "all") {
        const current = dryRun
          ? {
              id: documento.id,
              extractedText,
              extractionJson: documento.extractionJson,
            }
          : await prisma.documento.findUniqueOrThrow({
              where: { id: documento.id },
              select: {
                id: true,
                extractedText: true,
                extractionJson: true,
              },
            });
        await structureDocument(current);
      }

      if (mode === "embed" || mode === "all") {
        const current = dryRun
          ? { ...documento, extractedText }
          : await prisma.documento.findUniqueOrThrow({
              where: { id: documento.id },
              include: { _count: { select: { chunks: true } } },
            });
        await embedDocument(current);
      }

      console.log(
        `[${i + 1}/${documents.length}] OK ${documento.titoloOriginale}`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      report.failed++;
      report.errors.push({
        id: documento.id,
        title: documento.titoloOriginale,
        error: message,
      });
      if (!dryRun) {
        await prisma.documento
          .update({
            where: { id: documento.id },
            data: { statoIngestione: "FAILED" },
          })
          .catch(() => undefined);
      }
      console.error(
        `[${i + 1}/${documents.length}] ERRORE ${documento.titoloOriginale}: ${message}`
      );
    }
  }

  const estimatedCostUsd =
    (report.estimatedEmbeddingTokens / 1_000_000) * 0.02;
  console.log(
    JSON.stringify(
      {
        ...report,
        estimatedEmbeddingCostUsd: Number(estimatedCostUsd.toFixed(6)),
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
