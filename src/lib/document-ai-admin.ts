import { z } from "zod";
import type { DocumentoAiJobStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { DOCUMENT_EMBEDDING_PROFILE } from "@/lib/document-embedding-profile";
import {
  enqueueDocumentAiJob,
  pausePendingJobs,
  reconcileDocumentAiJobs,
  resumePausedJobs,
  retryFailedJobs,
} from "@/lib/document-ai-jobs";
import { getPgvectorCapability } from "@/lib/pgvector";
import { isOpenAiConfigured } from "@/lib/openai";
import { isR2Configured } from "@/lib/r2";

export const documentAiAdminActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("enqueue_pending") }),
  z.object({ action: z.literal("reindex_all") }),
  z.object({ action: z.literal("pause") }),
  z.object({ action: z.literal("resume") }),
  z.object({ action: z.literal("retry_failed") }),
  z.object({
    action: z.literal("full_reprocess"),
    confirmed: z.literal(true),
  }),
]);

export type DocumentAiAdminAction = z.infer<
  typeof documentAiAdminActionSchema
>;

const JOB_STATUSES: DocumentoAiJobStatus[] = [
  "PENDING",
  "RUNNING",
  "PAUSED",
  "COMPLETED",
  "FAILED",
];

export type DocumentAiAdminSnapshot = {
  documents: {
    total: number;
    pendingProfile: number;
    indexedV2: number;
    failed: number;
  };
  jobs: Record<DocumentoAiJobStatus, number>;
  totalTokens: number;
  recentJobs: Array<{
    id: string;
    documentoId: string;
    titolo: string;
    type: string;
    status: string;
    attempts: number;
    tokenCount: number;
    lastError: string | null;
    updatedAt: string;
  }>;
  profile: string;
  vectorMode: "pgvector" | "json";
  vectorReason: string | null;
  openaiConfigured: boolean;
  r2Configured: boolean;
};

export async function getDocumentAiAdminSnapshot(): Promise<DocumentAiAdminSnapshot> {
  const activeProfile = DOCUMENT_EMBEDDING_PROFILE.version;
  const [
    total,
    pendingProfile,
    indexedV2,
    failed,
    groupedJobs,
    tokenAggregate,
    recentJobs,
    vector,
  ] = await Promise.all([
    prisma.documento.count({ where: { canonicalDocumentoId: null } }),
    prisma.documento.count({
      where: {
        canonicalDocumentoId: null,
        aiWhitelist: true,
        OR: [
          { embeddingActiveProfile: null },
          { NOT: { embeddingActiveProfile: activeProfile } },
        ],
      },
    }),
    prisma.documento.count({
      where: {
        canonicalDocumentoId: null,
        aiWhitelist: true,
        embeddingActiveProfile: activeProfile,
        embeddingStatus: "READY",
      },
    }),
    prisma.documento.count({
      where: {
        canonicalDocumentoId: null,
        OR: [
          { embeddingStatus: "FAILED" },
          { statoIngestione: "FAILED" },
        ],
      },
    }),
    prisma.documentoAiJob.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
    prisma.documentoAiJob.aggregate({ _sum: { tokenCount: true } }),
    prisma.documentoAiJob.findMany({
      orderBy: { updatedAt: "desc" },
      take: 100,
      select: {
        id: true,
        documentoId: true,
        type: true,
        status: true,
        attempts: true,
        tokenCount: true,
        lastError: true,
        updatedAt: true,
        documento: { select: { titoloOriginale: true } },
      },
    }),
    getPgvectorCapability(),
  ]);

  const jobs = Object.fromEntries(
    JOB_STATUSES.map((status) => [status, 0])
  ) as Record<DocumentoAiJobStatus, number>;
  for (const row of groupedJobs) {
    jobs[row.status] = row._count._all;
  }

  return {
    documents: { total, pendingProfile, indexedV2, failed },
    jobs,
    totalTokens: tokenAggregate._sum.tokenCount ?? 0,
    recentJobs: recentJobs.map((job) => ({
      id: job.id,
      documentoId: job.documentoId,
      titolo: job.documento.titoloOriginale,
      type: job.type,
      status: job.status,
      attempts: job.attempts,
      tokenCount: job.tokenCount,
      lastError: job.lastError,
      updatedAt: job.updatedAt.toISOString(),
    })),
    profile: activeProfile,
    vectorMode: vector.available ? "pgvector" : "json",
    vectorReason: vector.reason,
    openaiConfigured: isOpenAiConfigured(),
    r2Configured: isR2Configured(),
  };
}

async function enqueueAll(
  type: "EMBEDDING_ONLY" | "FULL_REPROCESS"
): Promise<number> {
  const documents = await prisma.documento.findMany({
    where:
      type === "EMBEDDING_ONLY"
        ? { canonicalDocumentoId: null, aiWhitelist: true }
        : { canonicalDocumentoId: null },
    select: { id: true },
  });
  for (const document of documents) {
    await enqueueDocumentAiJob({
      documentoId: document.id,
      type,
    });
  }
  return documents.length;
}

export async function executeDocumentAiAdminAction(
  action: DocumentAiAdminAction
): Promise<{ affected: number }> {
  switch (action.action) {
    case "enqueue_pending":
      return { affected: await reconcileDocumentAiJobs(1000) };
    case "reindex_all":
      return { affected: await enqueueAll("EMBEDDING_ONLY") };
    case "full_reprocess":
      return { affected: await enqueueAll("FULL_REPROCESS") };
    case "pause":
      return { affected: await pausePendingJobs() };
    case "resume":
      return { affected: await resumePausedJobs() };
    case "retry_failed":
      return { affected: await retryFailedJobs() };
  }
}
