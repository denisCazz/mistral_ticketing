import type {
  DocumentoAiJob,
  DocumentoAiJobStatus,
  DocumentoAiJobType,
} from "@prisma/client";
import { prisma } from "@/lib/db";
import { DOCUMENT_EMBEDDING_PROFILE } from "@/lib/document-embedding-profile";
import { DOCUMENT_EMBEDDING_RETENTION_DAYS } from "@/lib/config";

export type FailedJobState = {
  status: "PENDING" | "FAILED";
  attempts: number;
  nextRunAt: Date;
  lastError: string;
  leaseOwner: null;
  leaseExpiresAt: null;
};

export function nextJobStateAfterFailure(input: {
  attempts: number;
  maxAttempts: number;
  terminal: boolean;
  now: Date;
  error: string;
}): FailedJobState {
  const attempts = input.attempts + 1;
  const failed = input.terminal || attempts >= input.maxAttempts;
  const delayMs = failed ? 0 : 2000 * 2 ** Math.max(0, attempts - 1);
  return {
    status: failed ? "FAILED" : "PENDING",
    attempts,
    nextRunAt: new Date(input.now.getTime() + delayMs),
    lastError: input.error.slice(0, 4000),
    leaseOwner: null,
    leaseExpiresAt: null,
  };
}

export function shouldRequeueExpiredLease(input: {
  status: DocumentoAiJobStatus;
  leaseExpiresAt: Date | null;
  now: Date;
}): boolean {
  return (
    input.status === "RUNNING" &&
    input.leaseExpiresAt !== null &&
    input.leaseExpiresAt <= input.now
  );
}

function isTerminalAiError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const status = Number((error as { status?: unknown }).status);
  const code = String((error as { code?: unknown }).code ?? "");
  return (
    status === 401 ||
    status === 403 ||
    code === "invalid_api_key" ||
    code === "insufficient_quota"
  );
}

export async function enqueueDocumentAiJob(input: {
  documentoId: string;
  type: DocumentoAiJobType;
  targetVersion?: string;
}): Promise<string> {
  const targetVersion =
    input.targetVersion ?? DOCUMENT_EMBEDDING_PROFILE.version;
  const compound = {
    documentoId: input.documentoId,
    type: input.type,
    targetVersion,
  };
  const existing = await prisma.documentoAiJob.findUnique({
    where: { documentoId_type_targetVersion: compound },
    select: { id: true, status: true },
  });
  if (existing?.status === "RUNNING") return existing.id;
  if (existing) {
    const updated = await prisma.documentoAiJob.update({
      where: { id: existing.id },
      data: {
        status: "PENDING",
        attempts: 0,
        nextRunAt: new Date(),
        leaseOwner: null,
        leaseExpiresAt: null,
        lastError: null,
        completedAt: null,
      },
      select: { id: true },
    });
    return updated.id;
  }

  try {
    const created = await prisma.documentoAiJob.create({
      data: {
        ...compound,
        status: "PENDING",
      },
      select: { id: true },
    });
    return created.id;
  } catch (error) {
    const raceWinner = await prisma.documentoAiJob.findUnique({
      where: { documentoId_type_targetVersion: compound },
      select: { id: true },
    });
    if (raceWinner) return raceWinner.id;
    throw error;
  }
}

export async function reconcileDocumentAiJobs(limit = 100): Promise<number> {
  const now = new Date();
  await prisma.documentoAiJob.updateMany({
    where: {
      status: "RUNNING",
      leaseExpiresAt: { lte: now },
    },
    data: {
      status: "PENDING",
      leaseOwner: null,
      leaseExpiresAt: null,
      nextRunAt: now,
      lastError: "Lease scaduto: job rimesso in coda",
    },
  });

  const documents = await prisma.documento.findMany({
    where: {
      canonicalDocumentoId: null,
      NOT: {
        statoIngestione: { in: ["FAILED", "DA_REVISIONARE"] },
      },
      OR: [
        { statoIngestione: "PENDING" },
        { extractedText: null },
        { extractedText: "" },
        { extractionAt: null },
        {
          aiWhitelist: true,
          NOT: {
            embeddingActiveProfile: DOCUMENT_EMBEDDING_PROFILE.version,
          },
        },
      ],
    },
    orderBy: { createdAt: "asc" },
    take: Math.min(1000, Math.max(1, limit)),
    select: {
      id: true,
      statoIngestione: true,
      extractedText: true,
      extractionAt: true,
      aiWhitelist: true,
      embeddingActiveProfile: true,
    },
  });

  let enqueued = 0;
  for (const document of documents) {
    const needsPipeline =
      document.statoIngestione === "PENDING" ||
      !document.extractedText?.trim() ||
      document.extractionAt === null;
    const type: DocumentoAiJobType = needsPipeline
      ? "FULL_PIPELINE"
      : "EMBEDDING_ONLY";
    await enqueueDocumentAiJob({
      documentoId: document.id,
      type,
    });
    enqueued += 1;
  }
  return enqueued;
}

export async function claimNextDocumentAiJob(
  workerId: string
): Promise<DocumentoAiJob | null> {
  const rows = await prisma.$queryRaw<DocumentoAiJob[]>`
    WITH candidate AS (
      SELECT id
      FROM "DocumentoAiJob"
      WHERE status = 'PENDING'::"DocumentoAiJobStatus"
        AND "nextRunAt" <= NOW()
      ORDER BY "nextRunAt", "createdAt"
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    UPDATE "DocumentoAiJob" AS job
    SET status = 'RUNNING'::"DocumentoAiJobStatus",
        "leaseOwner" = ${workerId},
        "leaseExpiresAt" = NOW() + INTERVAL '5 minutes',
        "startedAt" = COALESCE(job."startedAt", NOW()),
        "updatedAt" = NOW()
    FROM candidate
    WHERE job.id = candidate.id
    RETURNING job.*
  `;
  return rows[0] ?? null;
}

async function completeJob(job: DocumentoAiJob, tokenCount: number) {
  await prisma.documentoAiJob.update({
    where: { id: job.id },
    data: {
      status: "COMPLETED",
      tokenCount,
      leaseOwner: null,
      leaseExpiresAt: null,
      lastError: null,
      completedAt: new Date(),
    },
  });
}

export function embeddingOnlyNeedsPipeline(
  extractedText: string | null | undefined
): boolean {
  return !extractedText?.trim();
}

export async function runClaimedDocumentAiJob(
  job: DocumentoAiJob
): Promise<void> {
  try {
    let tokenCount = 0;
    const document =
      job.type === "EMBEDDING_ONLY"
        ? await prisma.documento.findUnique({
            where: { id: job.documentoId },
            select: { extractedText: true },
          })
        : null;
    const needsPipeline =
      job.type !== "EMBEDDING_ONLY" ||
      embeddingOnlyNeedsPipeline(document?.extractedText);

    if (job.type === "EMBEDDING_ONLY" && !needsPipeline) {
      const { indexDocumento } = await import("@/lib/document-indexer");
      const result = await indexDocumento(job.documentoId);
      tokenCount = result.tokenCount;
    } else {
      const { processDocumentoAi } = await import("@/lib/document-ai-batch");
      const force = job.type === "FULL_REPROCESS";
      const result = await processDocumentoAi(job.documentoId, {
        force,
        enableOcr: true,
        enableStructure: true,
        enableRag: true,
      });
      if (result.status === "FAIL") {
        throw new Error(result.error ?? "Elaborazione documento fallita");
      }
    }
    await completeJob(job, tokenCount);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`${job.type} ${job.documentoId}: ${message}`);
    const state = nextJobStateAfterFailure({
      attempts: job.attempts,
      maxAttempts: job.maxAttempts,
      terminal: isTerminalAiError(error),
      now: new Date(),
      error: message,
    });
    await prisma.documentoAiJob.update({
      where: { id: job.id },
      data: state,
    });
  }
}

export async function pausePendingJobs(): Promise<number> {
  const result = await prisma.documentoAiJob.updateMany({
    where: { status: "PENDING" },
    data: { status: "PAUSED" },
  });
  return result.count;
}

export async function resumePausedJobs(): Promise<number> {
  const result = await prisma.documentoAiJob.updateMany({
    where: { status: "PAUSED" },
    data: { status: "PENDING", nextRunAt: new Date() },
  });
  return result.count;
}

export async function retryFailedJobs(): Promise<number> {
  const result = await prisma.documentoAiJob.updateMany({
    where: { status: "FAILED" },
    data: {
      status: "PENDING",
      attempts: 0,
      nextRunAt: new Date(),
      lastError: null,
      completedAt: null,
    },
  });
  return result.count;
}

export async function cleanupInactiveEmbeddingGenerations(
  retentionDays = DOCUMENT_EMBEDDING_RETENTION_DAYS
): Promise<number> {
  const before = new Date(
    Date.now() - Math.max(1, retentionDays) * 24 * 60 * 60 * 1000
  );
  const deletedChunks = await prisma.$executeRaw`
    DELETE FROM "DocumentoChunk" AS chunk
    USING "Documento" AS document
    WHERE chunk."documentoId" = document.id
      AND document."embeddingActiveProfile" = ${DOCUMENT_EMBEDDING_PROFILE.version}
      AND chunk."embeddingVersion" <> document."embeddingActiveVersion"
      AND chunk."createdAt" < ${before}
  `;
  await prisma.$executeRaw`
    DELETE FROM "DocumentoEmbedding" AS embedding
    USING "Documento" AS document
    WHERE embedding."documentoId" = document.id
      AND document."embeddingActiveProfile" = ${DOCUMENT_EMBEDDING_PROFILE.version}
      AND embedding."embeddingVersion" <> document."embeddingActiveVersion"
      AND embedding."createdAt" < ${before}
  `;
  return deletedChunks;
}
