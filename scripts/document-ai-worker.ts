import "dotenv/config";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { prisma } from "../src/lib/db";
import {
  DOCUMENT_AI_WORKER_POLL_MS,
  DOCUMENT_EMBEDDING_CLEANUP_ENABLED,
} from "../src/lib/config";
import {
  claimNextDocumentAiJob,
  cleanupInactiveEmbeddingGenerations,
  reconcileDocumentAiJobs,
  runClaimedDocumentAiJob,
} from "../src/lib/document-ai-jobs";

const workerId = `worker-${randomUUID()}`;
let stopping = false;
let lastCleanupAt = 0;

process.on("SIGINT", () => {
  stopping = true;
});
process.on("SIGTERM", () => {
  stopping = true;
});

async function main() {
  console.log(`Document AI worker avviato: ${workerId}`);
  while (!stopping) {
    try {
      await reconcileDocumentAiJobs(100);
      if (
        DOCUMENT_EMBEDDING_CLEANUP_ENABLED &&
        Date.now() - lastCleanupAt >= 60 * 60 * 1000
      ) {
        const deleted = await cleanupInactiveEmbeddingGenerations();
        lastCleanupAt = Date.now();
        if (deleted > 0) {
          console.log(`Generazioni chunk obsolete eliminate: ${deleted}`);
        }
      }

      const job = await claimNextDocumentAiJob(workerId);
      if (!job) {
        await delay(DOCUMENT_AI_WORKER_POLL_MS);
        continue;
      }
      console.log(`${job.type} ${job.documentoId} tentativo ${job.attempts + 1}`);
      await runClaimedDocumentAiJob(job);
    } catch (error) {
      console.error("Errore ciclo worker:", error);
      await delay(DOCUMENT_AI_WORKER_POLL_MS);
    }
  }
  console.log("Document AI worker arrestato");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
