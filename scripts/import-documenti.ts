import "dotenv/config";

import path from "node:path";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, readdir, stat } from "node:fs/promises";
import { prisma } from "../src/lib/db";
import {
  classifyCategoriaFromPath,
  isAiWhitelistCandidate,
  shouldSkipFile,
} from "../src/lib/document-whitelist";
import { mimeFromExt } from "../src/lib/document-ingest";
import { parseScadenzaFromText } from "../src/lib/scadenza-parser";

const execFileAsync = promisify(execFile);

const dryRun = process.argv.includes("--dry-run");
const concurrency = Math.max(
  1,
  Math.min(16, Number(process.env.IMPORT_CONCURRENCY ?? 8))
);
const sourceRoot = path.resolve(
  process.env.DOCUMENTI_SOURCE_PATH ??
    path.join(
      process.env.HOME ?? "",
      "Desktop",
      "documenti Mistral Impianti"
    )
);

interface SourceFile {
  absolutePath: string;
  relativePath: string;
  name: string;
  extension: string;
  sizeBytes: number;
  sha256: string;
}

interface ImportStats {
  scanned: number;
  unique: number;
  duplicates: number;
  imported: number;
  existing: number;
  failed: number;
  uploaded: number;
  uploadExisting: number;
}

const stats: ImportStats = {
  scanned: 0,
  unique: 0,
  duplicates: 0,
  imported: 0,
  existing: 0,
  failed: 0,
  uploaded: 0,
  uploadExisting: 0,
};

async function walk(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(absolutePath)));
    } else if (entry.isFile() && !shouldSkipFile(entry.name)) {
      files.push(absolutePath);
    }
  }
  return files;
}

async function sha256File(filePath: string): Promise<string> {
  const buffer = await readFile(filePath);
  return createHash("sha256").update(buffer).digest("hex");
}

async function scanFiles(): Promise<SourceFile[]> {
  const paths = await walk(sourceRoot);
  const unique = new Map<string, SourceFile>();
  stats.scanned = paths.length;

  for (let index = 0; index < paths.length; index++) {
    const absolutePath = paths[index];
    const relativePath = path.relative(sourceRoot, absolutePath);
    const name = path.basename(absolutePath);
    const extension = path.extname(name).replace(/^\./, "").toLowerCase() || "bin";
    const [fileStats, sha256] = await Promise.all([
      stat(absolutePath),
      sha256File(absolutePath),
    ]);

    if (unique.has(sha256)) {
      stats.duplicates++;
      continue;
    }

    unique.set(sha256, {
      absolutePath,
      relativePath,
      name,
      extension,
      sizeBytes: fileStats.size,
      sha256,
    });

    if ((index + 1) % 100 === 0) {
      console.log(`Scansione: ${index + 1}/${paths.length}`);
    }
  }

  stats.unique = unique.size;
  return [...unique.values()];
}

function isLikelyEmployeeFolder(folderName: string): boolean {
  const normalized = folderName.trim();
  if (!normalized) return false;
  if (/archivio.*licenziati/i.test(normalized)) return false;
  // File (zip/pdf/…) finiti per sbaglio sotto DIPENDENTI — non sono anagrafiche
  if (/\.(zip|rar|7z|pdf|docx?|xlsx?|pptx?|png|jpe?g|gif|webp|eml|msg|txt)$/i.test(normalized)) {
    return false;
  }
  if (/\.zip\b/i.test(normalized)) return false;
  return true;
}

function splitEmployeeName(folderName: string): {
  cognome: string;
  nome: string;
  archiviato: boolean;
} | null {
  if (!isLikelyEmployeeFolder(folderName)) return null;
  const normalized = folderName.trim();
  const parts = normalized.split(/\s+/);
  return {
    cognome: parts[0] ?? "SCONOSCIUTO",
    nome: parts.slice(1).join(" ") || parts[0] || "SCONOSCIUTO",
    archiviato: false,
  };
}

async function prepareEntityCaches(files: SourceFile[]) {
  const dipendenti = await prisma.dipendente.findMany();
  const automezzi = await prisma.automezzo.findMany();
  const employeeMap = new Map(
    dipendenti.map((d) => [
      `${d.cognome}|${d.nome}`.toLowerCase(),
      d.id,
    ])
  );
  const vehicleMap = new Map(automezzi.map((v) => [v.targa, v.id]));

  const employeeFolders = new Set<string>();
  const vehiclePlates = new Set<string>();

  for (const file of files) {
    const parts = file.relativePath.split(path.sep);
    if (parts[0]?.toUpperCase().includes("DIPENDENTI") && parts[1]) {
      employeeFolders.add(parts[1]);
    }
    if (parts[0]?.toUpperCase().includes("AUTOMEZZI")) {
      const plate = file.relativePath
        .toUpperCase()
        .match(/[A-Z]{2}\s?\d{3}\s?[A-Z]{2}/)?.[0]
        ?.replace(/\s/g, "");
      if (plate) vehiclePlates.add(plate);
    }
  }

  for (const folder of employeeFolders) {
    const parsed = splitEmployeeName(folder);
    if (!parsed) continue;
    const key = `${parsed.cognome}|${parsed.nome}`.toLowerCase();
    if (!employeeMap.has(key)) {
      const created = await prisma.dipendente.create({ data: parsed });
      employeeMap.set(key, created.id);
    }
  }

  for (const targa of vehiclePlates) {
    if (!vehicleMap.has(targa)) {
      const created = await prisma.automezzo.create({ data: { targa } });
      vehicleMap.set(targa, created.id);
    }
  }

  return { employeeMap, vehicleMap };
}

async function runPool<T>(
  items: T[],
  worker: (item: T, index: number) => Promise<void>
) {
  let nextIndex = 0;
  const runners = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (true) {
        const index = nextIndex++;
        if (index >= items.length) return;
        await worker(items[index], index);
      }
    }
  );
  await Promise.all(runners);
}

async function importFile(
  file: SourceFile,
  index: number,
  existingHashes: Set<string>,
  employeeMap: Map<string, string>,
  vehicleMap: Map<string, string>
) {
  if (existingHashes.has(file.sha256)) {
    stats.existing++;
    return;
  }

  const parts = file.relativePath.split(path.sep);
  const classification = classifyCategoriaFromPath(parts);
  const parsedDeadline = parseScadenzaFromText(
    file.name,
    parts.slice(0, -1).join("/")
  );
  const aiWhitelist = isAiWhitelistCandidate(
    classification.categoria,
    classification.sottocategoria,
    file.relativePath
  );

  let dipendenteId: string | null = null;
  let automezzoId: string | null = null;

  if (classification.entityType === "DIPENDENTE" && parts[1]) {
    const employee = splitEmployeeName(parts[1]);
    if (employee) {
      dipendenteId =
        employeeMap.get(
          `${employee.cognome}|${employee.nome}`.toLowerCase()
        ) ?? null;
    }
  }

  if (classification.entityType === "AUTOMEZZO") {
    const plate = file.relativePath
      .toUpperCase()
      .match(/[A-Z]{2}\s?\d{3}\s?[A-Z]{2}/)?.[0]
      ?.replace(/\s/g, "");
    if (plate) automezzoId = vehicleMap.get(plate) ?? null;
  }

  const storageKey = `docs/${file.sha256.slice(0, 8)}/${file.sha256}.${file.extension}`;
  const mimeType = mimeFromExt(file.extension);

  try {
    const r2Result = await execFileAsync(
      process.execPath,
      [
        "--env-file=.env",
        "scripts/r2-put.mjs",
        file.absolutePath,
        storageKey,
        mimeType,
      ],
      {
        cwd: process.cwd(),
        timeout: 600_000,
        maxBuffer: 1024 * 1024,
      }
    );
    if (r2Result.stdout.trim() === "existing") {
      stats.uploadExisting++;
    } else {
      stats.uploaded++;
    }

    const documento = await prisma.documento.create({
      data: {
        storageKey,
        sha256: file.sha256,
        mimeType,
        sizeBytes: file.sizeBytes,
        titoloOriginale: file.name,
        categoria: classification.categoria,
        sottocategoria: classification.sottocategoria,
        entityType: classification.entityType,
        dipendenteId,
        automezzoId,
        dataScadenza: parsedDeadline.dataScadenza,
        scadenzaSource:
          parsedDeadline.dataScadenza || parsedDeadline.rawValue
            ? parsedDeadline.fonte
            : null,
        scadenzaConfidence: parsedDeadline.confidence,
        scadenzaRaw: parsedDeadline.rawValue,
        statoValidita: parsedDeadline.statoValidita,
        statoIngestione: "PENDING",
        aiWhitelist,
        sourcePath: file.relativePath,
      },
    });

    if (parsedDeadline.dataScadenza) {
      await prisma.scadenza.create({
        data: {
          documentoId: documento.id,
          dipendenteId,
          automezzoId,
          titolo: file.name,
          dataScadenza: parsedDeadline.dataScadenza,
          fonte: parsedDeadline.fonte,
          confidence: parsedDeadline.confidence,
          rawValue: parsedDeadline.rawValue,
          confermata: parsedDeadline.confidence >= 0.8,
        },
      });
    }

    existingHashes.add(file.sha256);
    stats.imported++;
  } catch (error) {
    const code =
      typeof error === "object" && error && "code" in error
        ? String(error.code)
        : "";
    if (code === "P2002") {
      stats.existing++;
      existingHashes.add(file.sha256);
    } else {
      stats.failed++;
      console.error(`ERRORE ${file.relativePath}:`, error);
    }
  }

  if ((index + 1) % 25 === 0) {
    console.log(
      `Import: ${index + 1}/${stats.unique}; nuovi=${stats.imported}; esistenti=${stats.existing}; errori=${stats.failed}`
    );
  }
}

async function main() {
  const r2Configured = Boolean(
    process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY &&
      process.env.R2_BUCKET &&
      (process.env.R2_ENDPOINT || process.env.R2_ACCOUNT_ID)
  );
  if (!dryRun && !r2Configured) {
    throw new Error("R2 non configurato: import reale annullato");
  }

  console.log(`Source: ${sourceRoot}`);
  console.log(
    `Dry run: ${dryRun}; concurrency: ${concurrency}`
  );

  const files = await scanFiles();
  if (dryRun) {
    console.log(JSON.stringify(stats, null, 2));
    return;
  }

  const existing = await prisma.documento.findMany({
    select: { sha256: true },
  });
  const existingHashes = new Set(existing.map((d) => d.sha256));
  const { employeeMap, vehicleMap } = await prepareEntityCaches(files);

  await runPool(files, (file, index) =>
    importFile(file, index, existingHashes, employeeMap, vehicleMap)
  );

  console.log(JSON.stringify(stats, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
