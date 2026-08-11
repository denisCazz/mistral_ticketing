import "dotenv/config";
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { prisma } from "../src/lib/db";

type GoldCase = {
  query: string;
  expectedDocumentoIds: string[];
  source: "audit" | "metadata";
};

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, value = "true"] = arg.replace(/^--/, "").split("=", 2);
    return [key, value];
  })
);
const outputPath = path.resolve(
  args.get("output") ?? "logs/retrieval-gold.json"
);
const minimum = Math.max(20, Number(args.get("min") ?? 20));

function normalizeQuery(query: string): string {
  return query.trim().replace(/\s+/g, " ").toLocaleLowerCase("it");
}

function sourceDocumentIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value
        .map((item) =>
          item &&
          typeof item === "object" &&
          typeof (item as { documentoId?: unknown }).documentoId === "string"
            ? (item as { documentoId: string }).documentoId
            : null
        )
        .filter((id): id is string => Boolean(id))
    ),
  ];
}

function formatItalianDate(date: Date): string {
  return new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

async function main() {
  const [audits, documents] = await Promise.all([
    prisma.aiGenerationAudit.findMany({
      orderBy: { createdAt: "desc" },
      take: 500,
      select: { prompt: true, sources: true, outputJson: true },
    }),
    prisma.documento.findMany({
      where: {
        canonicalDocumentoId: null,
        aiWhitelist: true,
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        titoloOriginale: true,
        categoria: true,
        dataScadenza: true,
        dipendente: { select: { nome: true, cognome: true } },
        automezzo: { select: { targa: true } },
      },
    }),
  ]);

  const byQuery = new Map<string, GoldCase>();
  for (const audit of audits) {
    const output = audit.outputJson;
    const type =
      output &&
      typeof output === "object" &&
      !Array.isArray(output) &&
      (output as { type?: unknown }).type;
    if (type !== "documenti_chat") continue;
    const ids = sourceDocumentIds(audit.sources);
    if (ids.length === 0) continue;
    byQuery.set(normalizeQuery(audit.prompt), {
      query: audit.prompt.trim(),
      expectedDocumentoIds: ids,
      source: "audit",
    });
  }

  for (const document of documents) {
    if (byQuery.size >= minimum) break;
    const entityLabel = document.dipendente
      ? `${document.dipendente.nome} ${document.dipendente.cognome}`.trim()
      : document.automezzo?.targa;
    const queries = [
      `Trova il documento ${document.titoloOriginale}`,
      entityLabel
        ? `Quali documenti riguardano ${entityLabel}?`
        : `Quali documenti appartengono alla categoria ${document.categoria}?`,
      document.dataScadenza
        ? `Quale documento scade il ${formatItalianDate(document.dataScadenza)}?`
        : `Mostrami ${document.titoloOriginale} nella categoria ${document.categoria}`,
    ];

    for (const query of queries) {
      const key = normalizeQuery(query);
      if (!byQuery.has(key)) {
        byQuery.set(key, {
          query,
          expectedDocumentoIds: [document.id],
          source: "metadata",
        });
      }
      if (byQuery.size >= minimum) break;
    }
  }

  const cases = [...byQuery.values()].slice(0, minimum);
  if (cases.length < minimum) {
    throw new Error(
      `Gold set insufficiente: ${cases.length} casi, richiesti ${minimum}`
    );
  }

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(
    outputPath,
    `${JSON.stringify(
      {
        createdAt: new Date().toISOString(),
        cases,
      },
      null,
      2
    )}\n`,
    "utf8"
  );
  console.log(`Gold set scritto: ${outputPath} (${cases.length} casi)`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
