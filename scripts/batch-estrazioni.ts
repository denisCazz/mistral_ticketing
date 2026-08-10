/**
 * Batch CLI: stessa pipeline della pagina admin.
 * OCR → struttura → RAG. Log OK/FAIL/REVIEW + summary JSON.
 *
 *   npm run documenti:batch-estrazioni
 *   npx tsx scripts/batch-estrazioni.ts --limit=50 --force=true
 */
import "dotenv/config";

import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { prisma } from "../src/lib/db";
import { isOpenAiConfigured } from "../src/lib/openai";
import {
  getDocumentiAiStats,
  listDocumentiAiPending,
  processDocumentoAi,
} from "../src/lib/document-ai-batch";

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, value = "true"] = arg.replace(/^--/, "").split("=", 2);
    return [key, value];
  })
);

const limit = Math.max(1, Number(args.get("limit") ?? "10000"));
const force = args.get("force") === "true";
const enableOcr = args.get("ocr") !== "false";
const enableStructure = args.get("structure") !== "false";
const enableRag = args.get("rag") !== "false";
const batchSize = Math.min(25, Math.max(1, Number(args.get("batch") ?? "10")));

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const logsDir = path.resolve(process.cwd(), "logs");
const jsonlPath = path.join(logsDir, `estrazioni-${stamp}.jsonl`);
const summaryPath = path.join(logsDir, `estrazioni-${stamp}-summary.json`);

function logLine(msg: string) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

async function main() {
  if (!isOpenAiConfigured()) {
    throw new Error("OPENAI_API_KEY mancante");
  }

  await mkdir(logsDir, { recursive: true });
  await writeFile(jsonlPath, "");

  const totals = {
    ok: 0,
    review: 0,
    skip: 0,
    fail: 0,
    chunksIndexed: 0,
    processed: 0,
  };

  logLine(
    `START force=${force} ocr=${enableOcr} structure=${enableStructure} rag=${enableRag} batch=${batchSize} limit=${limit}`
  );

  let done = 0;
  while (done < limit) {
    const take = Math.min(batchSize, limit - done);
    const pending = await listDocumentiAiPending({ force, limit: take });
    if (pending.length === 0) break;

    for (const doc of pending) {
      const result = await processDocumentoAi(doc.id, {
        force,
        enableOcr,
        enableStructure,
        enableRag,
      });
      totals.processed++;
      totals[result.status.toLowerCase() as "ok" | "review" | "skip" | "fail"]++;
      totals.chunksIndexed += result.chunksIndexed ?? 0;
      done++;

      await writeFile(jsonlPath, `${JSON.stringify(result)}\n`, { flag: "a" });
      logLine(
        `${result.status.padEnd(6)} ${doc.titoloOriginale}  rag=${result.rag ?? "-"} chunks=${result.chunksIndexed ?? 0}  ${result.error ?? ""} (${result.ms}ms)`
      );

      if (force) {
        // un solo passaggio su N documenti se force
      }
    }

    if (force) break;
  }

  const stats = await getDocumentiAiStats();
  const summary = {
    finishedAt: new Date().toISOString(),
    options: { limit, force, enableOcr, enableStructure, enableRag, batchSize },
    totals,
    stats,
    logs: { jsonl: jsonlPath, summary: summaryPath },
  };
  await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
  logLine(
    `SUMMARY ok=${totals.ok} review=${totals.review} skip=${totals.skip} fail=${totals.fail} chunks=${totals.chunksIndexed} inCoda=${stats.inCoda}`
  );
  logLine(`LOG ${summaryPath}`);
  if (totals.fail > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
