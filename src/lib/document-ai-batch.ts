import path from "node:path";
import { access, readFile } from "node:fs/promises";
import { prisma } from "@/lib/db";
import { extractTextWithOcrFallback } from "@/lib/document-ingest";
import { downloadFromR2, isR2Configured } from "@/lib/r2";
import { isOpenAiConfigured } from "@/lib/openai";
import { structureDocumento } from "@/lib/document-structure";
import { indexDocumentoChunks } from "@/lib/rag";
import { DOCUMENTI_SOURCE_PATH } from "@/lib/config";
import type { Prisma } from "@prisma/client";

export type DocumentiAiRowStatus = "OK" | "SKIP" | "REVIEW" | "FAIL";

export type DocumentiAiProcessResult = {
  id: string;
  titolo: string;
  categoria: string;
  status: DocumentiAiRowStatus;
  textSource?: string | null;
  decision?: string | null;
  dataScadenza?: string | null;
  needsReview?: boolean;
  chunksIndexed?: number;
  rag?: "indexed" | "skipped" | "not_whitelisted" | "failed";
  error?: string;
  ms: number;
};

export type DocumentiAiStats = {
  totale: number;
  inCoda: number;
  senzaTesto: number;
  daStrutturare: number;
  strutturati: number;
  daIndicizzareRag: number;
  indicizzatiRag: number;
  daRevisionare: number;
  failed: number;
  openaiConfigured: boolean;
  r2Configured: boolean;
};

function sourceRoot(): string {
  return path.resolve(
    /* turbopackIgnore: true */
    DOCUMENTI_SOURCE_PATH ||
      path.join(
        /* turbopackIgnore: true */
        process.env.HOME ?? process.env.USERPROFILE ?? "",
        "Desktop",
        "documenti Mistral Impianti"
      )
  );
}

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
  const root = sourceRoot();
  if (documento.sourcePath) {
    const candidate = path.resolve(
      /* turbopackIgnore: true */
      root,
      documento.sourcePath
    );
    const inside =
      candidate === root || candidate.startsWith(`${root}${path.sep}`);
    if (inside && (await fileExists(candidate))) {
      return readFile(candidate);
    }
  }
  if (isR2Configured()) {
    return downloadFromR2(documento.storageKey);
  }
  throw new Error("File non trovato (path locale / R2)");
}

/** Condizione coda: nuovi PENDING, testo/struttura mancanti, whitelist senza embedding. */
export function pendingAiWhere(): Prisma.DocumentoWhereInput {
  return {
    canonicalDocumentoId: null as string | null,
    NOT: {
      statoIngestione: { in: ["FAILED", "DA_REVISIONARE"] },
    },
    OR: [
      { statoIngestione: "PENDING" as const },
      { extractedText: null },
      { extractedText: "" },
      { extractionAt: null },
      {
        AND: [
          { aiWhitelist: true },
          { extractedText: { not: null } },
          { chunks: { none: {} } },
        ],
      },
    ],
  };
}

export async function getDocumentiAiStats(): Promise<DocumentiAiStats> {
  const base = { canonicalDocumentoId: null as string | null };

  const [
    totale,
    inCoda,
    senzaTesto,
    daStrutturare,
    strutturati,
    daIndicizzareRag,
    indicizzatiRag,
    daRevisionare,
    failed,
  ] = await Promise.all([
    prisma.documento.count({ where: base }),
    prisma.documento.count({ where: pendingAiWhere() }),
    prisma.documento.count({
      where: { ...base, OR: [{ extractedText: null }, { extractedText: "" }] },
    }),
    prisma.documento.count({
      where: {
        ...base,
        extractedText: { not: null },
        extractionAt: null,
      },
    }),
    prisma.documento.count({
      where: { ...base, extractionAt: { not: null } },
    }),
    prisma.documento.count({
      where: {
        ...base,
        aiWhitelist: true,
        extractedText: { not: null },
        chunks: { none: {} },
      },
    }),
    prisma.documento.count({
      where: {
        ...base,
        aiWhitelist: true,
        chunks: { some: {} },
      },
    }),
    prisma.documento.count({
      where: { ...base, statoValidita: "DA_REVISIONARE" },
    }),
    prisma.documento.count({
      where: { ...base, statoIngestione: "FAILED" },
    }),
  ]);

  return {
    totale,
    inCoda,
    senzaTesto,
    daStrutturare,
    strutturati,
    daIndicizzareRag,
    indicizzatiRag,
    daRevisionare,
    failed,
    openaiConfigured: isOpenAiConfigured(),
    r2Configured: isR2Configured(),
  };
}

export async function processDocumentoAi(
  documentoId: string,
  options: {
    force?: boolean;
    enableOcr?: boolean;
    enableStructure?: boolean;
    enableRag?: boolean;
    userId?: string | null;
  } = {}
): Promise<DocumentiAiProcessResult> {
  const started = Date.now();
  const force = options.force === true;
  const enableOcr = options.enableOcr !== false;
  const enableStructure = options.enableStructure !== false;
  const enableRag = options.enableRag !== false;

  const doc = await prisma.documento.findUnique({
    where: { id: documentoId },
    select: {
      id: true,
      titoloOriginale: true,
      categoria: true,
      mimeType: true,
      storageKey: true,
      sourcePath: true,
      extractedText: true,
      extractionAt: true,
      extractionJson: true,
      aiWhitelist: true,
      _count: { select: { chunks: true } },
    },
  });

  if (!doc) {
    return {
      id: documentoId,
      titolo: "",
      categoria: "",
      status: "FAIL",
      error: "Documento non trovato",
      ms: Date.now() - started,
    };
  }

  const base = {
    id: doc.id,
    titolo: doc.titoloOriginale,
    categoria: doc.categoria,
  };

  try {
    let extractedText = doc.extractedText;
    let textSource: string | null = extractedText ? "cached" : null;
    let didExtract = false;
    let structureSkipped = false;
    let needsReview = false;
    let decision: string | null = null;
    let dataScadenza: string | null = null;
    let chunksIndexed = 0;
    let rag: DocumentiAiProcessResult["rag"] = "skipped";

    // 1) Testo / OCR
    if (force || !extractedText?.trim()) {
      const buffer = await loadDocumentBuffer(doc);
      const extracted = await extractTextWithOcrFallback({
        buffer,
        mimeType: doc.mimeType,
        filename: doc.titoloOriginale,
        enableOcr,
      });
      extractedText = extracted.text;
      textSource = extracted.source;
      didExtract = true;

      if (!extractedText) {
        await prisma.documento.update({
          where: { id: doc.id },
          data: { statoIngestione: "DA_REVISIONARE", extractedText: null },
        });
        return {
          ...base,
          status: "FAIL",
          textSource,
          error: "Nessun testo (nativo/OCR)",
          ms: Date.now() - started,
        };
      }

      await prisma.documento.update({
        where: { id: doc.id },
        data: { extractedText, statoIngestione: "PENDING" },
      });
      await prisma.documentoTesto.deleteMany({ where: { documentoId: doc.id } });
      await prisma.documentoTesto.create({
        data: { documentoId: doc.id, content: extractedText },
      });
    }

    // 2) Estrazione strutturata
    if (enableStructure) {
      if (!isOpenAiConfigured()) {
        return {
          ...base,
          status: "FAIL",
          textSource,
          error: "OPENAI_API_KEY mancante",
          ms: Date.now() - started,
        };
      }

      const structured = await structureDocumento(doc.id, {
        force: force || !doc.extractionJson,
        userId: options.userId,
      });

      if (!structured.ok) {
        return {
          ...base,
          status: "FAIL",
          textSource,
          error: structured.reason ?? "structure failed",
          ms: Date.now() - started,
        };
      }

      if (structured.skipped) {
        structureSkipped = true;
      } else {
        decision = structured.decision ?? null;
        dataScadenza = structured.dataScadenza ?? null;
        needsReview = Boolean(structured.needsReview);
      }
    }

    // 3) RAG / embedding (solo whitelist)
    const current = await prisma.documento.findUniqueOrThrow({
      where: { id: doc.id },
      select: {
        aiWhitelist: true,
        extractedText: true,
        _count: { select: { chunks: true } },
      },
    });

    if (!enableRag) {
      rag = "skipped";
      if (!current.aiWhitelist) {
        await prisma.documento.update({
          where: { id: doc.id },
          data: { statoIngestione: "READY" },
        });
      }
    } else if (!current.aiWhitelist) {
      rag = "not_whitelisted";
      await prisma.documento.update({
        where: { id: doc.id },
        data: { statoIngestione: "READY" },
      });
    } else if (!current.extractedText?.trim()) {
      rag = "failed";
      return {
        ...base,
        status: "FAIL",
        textSource,
        decision,
        dataScadenza,
        needsReview,
        rag,
        error: "RAG: testo assente",
        ms: Date.now() - started,
      };
    } else if (!isOpenAiConfigured()) {
      return {
        ...base,
        status: "FAIL",
        textSource,
        decision,
        dataScadenza,
        needsReview,
        rag: "failed",
        error: "OPENAI_API_KEY mancante per RAG",
        ms: Date.now() - started,
      };
    } else if (force || current._count.chunks === 0) {
      try {
        chunksIndexed = await indexDocumentoChunks(doc.id);
        rag = "indexed";
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await prisma.documento.update({
          where: { id: doc.id },
          data: { statoIngestione: "FAILED" },
        });
        return {
          ...base,
          status: "FAIL",
          textSource,
          decision,
          dataScadenza,
          needsReview,
          rag: "failed",
          error: `RAG: ${message}`,
          ms: Date.now() - started,
        };
      }
    } else {
      rag = "skipped";
      await prisma.documento.update({
        where: { id: doc.id },
        data: { statoIngestione: "READY" },
      });
    }

    const nothingDone =
      !didExtract &&
      structureSkipped &&
      (rag === "skipped" || rag === "not_whitelisted") &&
      !force;

    if (nothingDone) {
      return {
        ...base,
        status: "SKIP",
        textSource,
        decision,
        dataScadenza,
        needsReview,
        chunksIndexed,
        rag,
        error: "Già elaborato (testo + struttura + RAG)",
        ms: Date.now() - started,
      };
    }

    return {
      ...base,
      status: needsReview ? "REVIEW" : "OK",
      textSource,
      decision,
      dataScadenza,
      needsReview,
      chunksIndexed,
      rag,
      ms: Date.now() - started,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.documento
      .update({
        where: { id: doc.id },
        data: { statoIngestione: "FAILED" },
      })
      .catch(() => undefined);
    return {
      ...base,
      status: "FAIL",
      error: message,
      ms: Date.now() - started,
    };
  }
}

export async function listDocumentiAiPending(options: {
  force?: boolean;
  limit?: number;
}): Promise<Array<{ id: string; titoloOriginale: string; categoria: string }>> {
  const limit = Math.min(100, Math.max(1, options.limit ?? 10));
  const force = options.force === true;

  return prisma.documento.findMany({
    where: force
      ? { canonicalDocumentoId: null }
      : pendingAiWhere(),
    orderBy: [{ statoIngestione: "asc" }, { createdAt: "asc" }],
    take: limit,
    select: {
      id: true,
      titoloOriginale: true,
      categoria: true,
    },
  });
}
