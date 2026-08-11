import { Pool } from "pg";
import { readFile } from "node:fs/promises";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL mancante: impossibile sincronizzare lo schema.");
  process.exit(1);
}

const embeddingV2Migration = await readFile(
  new URL(
    "./migrations/20260810170000_embedding_v2/migration.sql",
    import.meta.url
  ),
  "utf8"
);

const statements = [
  // Drop legacy Pratica tables if present
  `DROP TABLE IF EXISTS "PraticaStoria" CASCADE;`,
  `DROP TABLE IF EXISTS "Pratica" CASCADE;`,
  `DROP TABLE IF EXISTS "Cat" CASCADE;`,

  // Remove legacy Rapportino.praticaId if present
  `ALTER TABLE "Rapportino" DROP COLUMN IF EXISTS "praticaId";`,

  // Magazzino
  `DO $$ BEGIN
    CREATE TYPE "TipoMovimentoMagazzino" AS ENUM ('ENTRATA', 'USCITA', 'RETTIFICA');
  EXCEPTION WHEN duplicate_object THEN NULL;
  END $$;`,

  `CREATE TABLE IF NOT EXISTS "Articolo" (
    "id" TEXT NOT NULL,
    "codice" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descrizione" TEXT,
    "unitaMisura" TEXT NOT NULL DEFAULT 'pz',
    "quantita" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "sogliaMinima" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "ubicazione" TEXT,
    "attivo" BOOLEAN NOT NULL DEFAULT true,
    "ean" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Articolo_pkey" PRIMARY KEY ("id")
  );`,

  `CREATE UNIQUE INDEX IF NOT EXISTS "Articolo_codice_key" ON "Articolo"("codice");`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "Articolo_ean_key" ON "Articolo"("ean");`,
  `CREATE INDEX IF NOT EXISTS "Articolo_nome_idx" ON "Articolo"("nome");`,
  `CREATE INDEX IF NOT EXISTS "Articolo_attivo_idx" ON "Articolo"("attivo");`,

  `CREATE TABLE IF NOT EXISTS "MovimentoMagazzino" (
    "id" TEXT NOT NULL,
    "articoloId" TEXT NOT NULL,
    "tipo" "TipoMovimentoMagazzino" NOT NULL,
    "quantita" DECIMAL(12,3) NOT NULL,
    "note" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MovimentoMagazzino_pkey" PRIMARY KEY ("id")
  );`,

  `CREATE INDEX IF NOT EXISTS "MovimentoMagazzino_articoloId_idx" ON "MovimentoMagazzino"("articoloId");`,
  `CREATE INDEX IF NOT EXISTS "MovimentoMagazzino_userId_idx" ON "MovimentoMagazzino"("userId");`,
  `CREATE INDEX IF NOT EXISTS "MovimentoMagazzino_createdAt_idx" ON "MovimentoMagazzino"("createdAt");`,
  `CREATE INDEX IF NOT EXISTS "MovimentoMagazzino_tipo_idx" ON "MovimentoMagazzino"("tipo");`,

  `DO $$ BEGIN
    ALTER TABLE "MovimentoMagazzino"
      ADD CONSTRAINT "MovimentoMagazzino_articoloId_fkey"
      FOREIGN KEY ("articoloId") REFERENCES "Articolo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END $$;`,

  `DO $$ BEGIN
    ALTER TABLE "MovimentoMagazzino"
      ADD CONSTRAINT "MovimentoMagazzino_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END $$;`,

  // Document structured extraction
  `DO $$ BEGIN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_enum e
      JOIN pg_type t ON e.enumtypid = t.oid
      WHERE t.typname = 'FonteScadenza' AND e.enumlabel = 'AI'
    ) THEN
      ALTER TYPE "FonteScadenza" ADD VALUE 'AI';
    END IF;
  END $$;`,
  `ALTER TABLE "Documento" ADD COLUMN IF NOT EXISTS "extractionJson" JSONB;`,
  `ALTER TABLE "Documento" ADD COLUMN IF NOT EXISTS "extractionAt" TIMESTAMP(3);`,
  `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "mustChangePassword" BOOLEAN NOT NULL DEFAULT false`,
  embeddingV2Migration,
  `DO $$ BEGIN
    CREATE EXTENSION IF NOT EXISTS vector;
  EXCEPTION
    WHEN insufficient_privilege OR undefined_file OR feature_not_supported THEN
      RAISE NOTICE 'pgvector unavailable; JSON fallback remains active';
  END $$;`,
  `DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
      ALTER TABLE "DocumentoChunk"
        ADD COLUMN IF NOT EXISTS "embeddingVector" vector(1536);
      ALTER TABLE "DocumentoEmbedding"
        ADD COLUMN IF NOT EXISTS "centroidVector" vector(1536);
      CREATE INDEX IF NOT EXISTS "DocumentoChunk_embeddingVector_hnsw"
        ON "DocumentoChunk" USING hnsw ("embeddingVector" vector_cosine_ops);
      CREATE INDEX IF NOT EXISTS "DocumentoEmbedding_centroidVector_hnsw"
        ON "DocumentoEmbedding" USING hnsw ("centroidVector" vector_cosine_ops);
    END IF;
  END $$;`,
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function connectWithRetry(pool, attempts = 30, delayMs = 2000) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const client = await pool.connect();
      console.log(`DB connesso (tentativo ${attempt}/${attempts}).`);
      return client;
    } catch (error) {
      lastError = error;
      console.warn(
        `DB non pronto (tentativo ${attempt}/${attempts}):`,
        error instanceof Error ? error.message : error
      );
      await sleep(delayMs);
    }
  }
  throw lastError;
}

const pool = new Pool({ connectionString: DATABASE_URL });
const client = await connectWithRetry(pool);

try {
  for (const sql of statements) {
    try {
      await client.query(sql);
      console.log("OK:", sql.trim().split("\n")[0]);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // Non bloccare l'app per indici FTS/opzionali già presenti o non supportati.
      if (
        /DocumentoChunk_fts_it_idx|text search configuration|already exists|duplicate key/i.test(
          message
        )
      ) {
        console.warn("SKIP (non bloccante):", message);
        continue;
      }
      throw error;
    }
  }
  console.log("Schema sincronizzato con successo.");
} catch (error) {
  console.error("Errore sincronizzazione schema:", error);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
