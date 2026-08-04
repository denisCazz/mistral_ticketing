/**
 * Import idempotente documenti da cartella sorgente → R2 + DB.
 * Uso: node --env-file=.env scripts/import-documenti.mjs [--dry-run]
 */
import { createHash } from "crypto";
import { readdir, readFile } from "fs/promises";
import path from "path";
import { Pool } from "pg";
import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";

const DRY_RUN = process.argv.includes("--dry-run");
const SOURCE =
  process.env.DOCUMENTI_SOURCE_PATH ??
  path.join(process.env.HOME ?? "", "Desktop/documenti Mistral Impianti");

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const R2_ENDPOINT =
  process.env.R2_ENDPOINT ??
  (process.env.R2_ACCOUNT_ID
    ? `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
    : "");
const s3 =
  process.env.R2_ACCESS_KEY_ID && R2_ENDPOINT
    ? new S3Client({
        region: "auto",
        endpoint: R2_ENDPOINT,
        credentials: {
          accessKeyId: process.env.R2_ACCESS_KEY_ID,
          secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
        },
      })
    : null;

const SKIP = new Set(["thumbs.db", ".ds_store"]);
const BLOCKED = [
  "unilav",
  "idoneita",
  "licenziati",
  "f24",
  "durc",
  "durf",
  "visure",
  "consegna dpi",
];

const ALLOWED = [
  "formazione",
  "antincendio",
  "ple",
  "pes",
  "pav",
  "preposto",
  "assicurazioni",
  "libretti",
  "sicurezza",
  "attestato",
];

function shouldSkip(name) {
  const l = name.toLowerCase();
  if (SKIP.has(l)) return true;
  if (l.startsWith("~$")) return true;
  if (l.endsWith(".db")) return true;
  return false;
}

function sha256(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

function mimeFromExt(ext) {
  const m = {
    pdf: "application/pdf",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    rtf: "application/rtf",
    zip: "application/zip",
    rar: "application/x-rar-compressed",
    eml: "message/rfc822",
    bmp: "image/bmp",
  };
  return m[ext.toLowerCase()] ?? "application/octet-stream";
}

function classify(parts) {
  const top = (parts[0] ?? "").toUpperCase();
  if (top.includes("AUTOMEZZI")) {
    return {
      entityType: "AUTOMEZZO",
      categoria: parts[1] ?? "GENERALE",
      sottocategoria: parts[2],
      entityKey: parts[2] ?? parts[1],
    };
  }
  if (top.includes("DIPENDENTI")) {
    return {
      entityType: "DIPENDENTE",
      categoria: parts[2] ?? parts[1] ?? "GENERALE",
      sottocategoria: parts[3],
      entityKey: parts[1],
    };
  }
  return {
    entityType: "AZIENDA",
    categoria: top || "AZIENDA",
    sottocategoria: parts[1],
    entityKey: top,
  };
}

function aiWhitelist(categoria, sottocategoria, fullPath) {
  const hay = `${categoria} ${sottocategoria ?? ""} ${fullPath}`.toLowerCase();
  if (BLOCKED.some((b) => hay.includes(b))) return false;
  return ALLOWED.some((a) => hay.includes(a));
}

function parseScadenza(text, folderPath) {
  const combined = `${folderPath} ${text}`;
  if (/scadut/i.test(combined)) {
    return {
      dataScadenza: null,
      fonte: "FOLDER",
      confidence: 0.9,
      rawValue: "scaduto",
      statoValidita: "SCADUTO",
    };
  }
  const m = combined.match(/scad\.?\s*(\d{1,2})\s+(\d{1,2})\s+(\d{2,4})/i);
  if (m) {
    let y = parseInt(m[3], 10);
    if (y < 100) y += 2000;
    const d = parseInt(m[1], 10);
    const mo = parseInt(m[2], 10);
    const date = new Date(y, mo - 1, d);
    if (!isNaN(date.getTime())) {
      return {
        dataScadenza: date,
        fonte: "FILENAME",
        confidence: 0.85,
        rawValue: m[0],
        statoValidita: "VALIDO",
      };
    }
  }
  return {
    dataScadenza: null,
    fonte: "MANUALE",
    confidence: 0,
    rawValue: null,
    statoValidita: "DA_REVISIONARE",
  };
}

async function walk(dir, base = SOURCE) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      files.push(...await walk(full, base));
    } else if (!shouldSkip(e.name)) {
      const rel = path.relative(base, full);
      files.push({ full, rel, name: e.name });
    }
  }
  return files;
}

async function upsertDipendente(client, nomeParts) {
  if (!nomeParts) return null;
  const folder = nomeParts.trim();
  if (
    /\.(zip|rar|7z|pdf|docx?|xlsx?|pptx?|png|jpe?g|gif|webp|eml|msg|txt)$/i.test(folder) ||
    /\.zip\b/i.test(folder) ||
    /archivio.*licenziati/i.test(folder)
  ) {
    return null;
  }
  const parts = folder.split(/\s+/);
  const cognome = parts[0] ?? "UNKNOWN";
  const nome = parts.slice(1).join(" ") || cognome;
  const res = await client.query(
    `SELECT id FROM "Dipendente" WHERE cognome = $1 AND nome = $2 LIMIT 1`,
    [cognome, nome]
  );
  if (res.rows[0]) return res.rows[0].id;
  const ins = await client.query(
    `INSERT INTO "Dipendente" (id, nome, cognome, active, archiviato, "createdAt", "updatedAt")
     VALUES (gen_random_uuid()::text, $1, $2, true, false, NOW(), NOW())
     RETURNING id`,
    [nome, cognome]
  );
  return ins.rows[0].id;
}

async function upsertAutomezzo(client, targa) {
  const clean = (targa ?? "").replace(/[^A-Z0-9]/gi, "").toUpperCase();
  if (!clean) return null;
  const res = await client.query(
    `SELECT id FROM "Automezzo" WHERE targa = $1 LIMIT 1`,
    [clean]
  );
  if (res.rows[0]) return res.rows[0].id;
  const ins = await client.query(
    `INSERT INTO "Automezzo" (id, targa, superato, "createdAt", "updatedAt")
     VALUES (gen_random_uuid()::text, $1, false, NOW(), NOW())
     RETURNING id`,
    [clean]
  );
  return ins.rows[0].id;
}

async function main() {
  console.log(`Source: ${SOURCE}`);
  console.log(`Dry run: ${DRY_RUN}`);

  const allFiles = await walk(SOURCE);
  console.log(`File trovati: ${allFiles.length}`);

  const client = DRY_RUN ? null : await pool.connect();
  const hashIndex = new Map();
  let imported = 0;
  let skipped = 0;
  let duplicates = 0;

  try {
    for (const file of allFiles) {
      const buf = await readFile(file.full);
      const hash = sha256(buf);
      if (hashIndex.has(hash)) {
        duplicates++;
        if (!DRY_RUN) {
          const canonicalId = hashIndex.get(hash);
          await client.query(
            `INSERT INTO "Documento" (
              id, "storageKey", sha256, "mimeType", "sizeBytes", "titoloOriginale",
              categoria, sottocategoria, "entityType", "canonicalDocumentoId",
              "statoValidita", "statoIngestione", "aiWhitelist", "sourcePath",
              "createdAt", "updatedAt"
            ) VALUES (
              gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7, $8, $9,
              'VALIDO', 'READY', false, $10, NOW(), NOW()
            ) ON CONFLICT (sha256) DO NOTHING`,
            [
              `dup/${hash}`,
              hash,
              mimeFromExt(path.extname(file.name)),
              buf.length,
              file.name,
              "DUPLICATO",
              null,
              "AZIENDA",
              canonicalId,
              file.rel,
            ]
          );
        }
        continue;
      }

      const parts = file.rel.split(path.sep);
      const cls = classify(parts);
      const scad = parseScadenza(file.name, parts.join("/"));
      const whitelist = aiWhitelist(
        cls.categoria,
        cls.sottocategoria,
        file.rel
      );

      const ext = path.extname(file.name).replace(/^\./, "") || "bin";
      const storageKey = `docs/${hash.slice(0, 8)}/${hash}.${ext}`;

      if (DRY_RUN) {
        imported++;
        hashIndex.set(hash, `dry-${hash}`);
        continue;
      }

      let dipendenteId = null;
      let automezzoId = null;
      if (cls.entityType === "DIPENDENTE" && cls.entityKey) {
        dipendenteId = await upsertDipendente(client, cls.entityKey);
      }
      if (cls.entityType === "AUTOMEZZO") {
        const targa =
          cls.entityKey?.match(/[A-Z]{2}\d{3}[A-Z]{2}/i)?.[0] ??
          cls.entityKey;
        automezzoId = await upsertAutomezzo(client, targa);
      }

      const exists = await client.query(
        `SELECT id FROM "Documento" WHERE sha256 = $1`,
        [hash]
      );
      if (exists.rows[0]) {
        skipped++;
        hashIndex.set(hash, exists.rows[0].id);
        continue;
      }

      if (s3 && process.env.R2_BUCKET) {
        try {
          await s3.send(
            new HeadObjectCommand({
              Bucket: process.env.R2_BUCKET,
              Key: storageKey,
            })
          );
        } catch {
          await s3.send(
            new PutObjectCommand({
              Bucket: process.env.R2_BUCKET,
              Key: storageKey,
              Body: buf,
              ContentType: mimeFromExt(ext),
            })
          );
        }
      }

      const statoIngestione =
        scad.statoValidita === "DA_REVISIONARE" ? "DA_REVISIONARE" : "READY";

      const ins = await client.query(
        `INSERT INTO "Documento" (
          id, "storageKey", sha256, "mimeType", "sizeBytes", "titoloOriginale",
          categoria, sottocategoria, "entityType", "dipendenteId", "automezzoId",
          "dataScadenza", "scadenzaSource", "scadenzaConfidence", "scadenzaRaw",
          "statoValidita", "statoIngestione", "aiWhitelist", "sourcePath",
          "createdAt", "updatedAt"
        ) VALUES (
          gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
          $11, $12, $13, $14, $15, $16, $17, $18, NOW(), NOW()
        ) RETURNING id`,
        [
          storageKey,
          hash,
          mimeFromExt(ext),
          buf.length,
          file.name,
          cls.categoria,
          cls.sottocategoria,
          cls.entityType,
          dipendenteId,
          automezzoId,
          scad.dataScadenza,
          scad.fonte,
          scad.confidence,
          scad.rawValue,
          scad.statoValidita,
          statoIngestione,
          whitelist,
          file.rel,
        ]
      );

      const docId = ins.rows[0].id;
      hashIndex.set(hash, docId);

      if (scad.dataScadenza && scad.confidence >= 0.6) {
        await client.query(
          `INSERT INTO "Scadenza" (
            id, "documentoId", titolo, "dataScadenza", confermata, fonte, confidence, "rawValue",
            "createdAt", "updatedAt"
          ) VALUES (
            gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7, NOW(), NOW()
          )`,
          [
            docId,
            file.name,
            scad.dataScadenza,
            scad.confidence >= 0.8,
            scad.fonte,
            scad.confidence,
            scad.rawValue,
          ]
        );
      }

      imported++;
    }
  } finally {
    client?.release();
    await pool.end();
  }

  console.log(
    JSON.stringify({ imported, skipped, duplicates, total: allFiles.length }, null, 2)
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
