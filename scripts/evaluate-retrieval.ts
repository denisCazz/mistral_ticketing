import "dotenv/config";
import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { prisma } from "../src/lib/db";
import { embedText } from "../src/lib/openai";
import { searchDocumentChunks } from "../src/lib/document-retrieval";
import { calculateRetrievalMetrics } from "../src/lib/retrieval-metrics";

type GoldFile = {
  cases: Array<{
    query: string;
    expectedDocumentoIds: string[];
  }>;
};

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, value = "true"] = arg.replace(/^--/, "").split("=", 2);
    return [key, value];
  })
);
const goldPath = path.resolve(
  args.get("gold") ?? "logs/retrieval-gold.json"
);
const label = (args.get("label") ?? "current").replace(/[^\w.-]+/g, "_");
const outputPath = path.resolve(`logs/retrieval-${label}.json`);
const comparePath = args.get("compare")
  ? path.resolve(args.get("compare")!)
  : null;

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}

async function main() {
  const gold = await readJson<GoldFile>(goldPath);
  if (!Array.isArray(gold.cases) || gold.cases.length < 20) {
    throw new Error("Il gold set deve contenere almeno 20 casi");
  }

  const evaluated = [];
  const modes = { pgvector: 0, json: 0 };
  for (let index = 0; index < gold.cases.length; index += 1) {
    const item = gold.cases[index];
    const startedAt = performance.now();
    const query = await embedText(item.query);
    const retrieval = await searchDocumentChunks({
      embedding: query.embedding,
      query: item.query,
      limit: 12,
      scope: { canAccessHr: true },
    });
    modes[retrieval.mode] += 1;
    const actual = [
      ...new Set(retrieval.chunks.map((chunk) => chunk.documentoId)),
    ].slice(0, 5);
    evaluated.push({
      query: item.query,
      expected: item.expectedDocumentoIds,
      actual,
      latencyMs: performance.now() - startedAt,
      mode: retrieval.mode,
    });
    console.log(`[${index + 1}/${gold.cases.length}] ${item.query}`);
  }

  const metrics = calculateRetrievalMetrics(evaluated);
  const report = {
    label,
    createdAt: new Date().toISOString(),
    goldPath,
    metrics,
    modes,
    cases: evaluated,
  };
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ outputPath, metrics, modes }, null, 2));

  if (comparePath) {
    const baseline = await readJson<{ metrics: typeof metrics }>(comparePath);
    const recallDelta =
      baseline.metrics.recallAt5 > 0
        ? (metrics.recallAt5 - baseline.metrics.recallAt5) /
          baseline.metrics.recallAt5
        : metrics.recallAt5 > 0
          ? 1
          : 0;
    console.log(
      JSON.stringify(
        {
          baseline: baseline.metrics,
          current: metrics,
          relativeRecallAt5Change: recallDelta,
          targetReached: recallDelta >= 0.1,
        },
        null,
        2
      )
    );
    if (
      metrics.recallAt5 < baseline.metrics.recallAt5 ||
      metrics.mrr < baseline.metrics.mrr
    ) {
      throw new Error("Quality gate fallita: regressione Recall@5 o MRR");
    }
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
