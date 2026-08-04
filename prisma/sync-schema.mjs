import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

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
    "ean" TEXT,
    "nome" TEXT NOT NULL,
    "descrizione" TEXT,
    "unitaMisura" TEXT NOT NULL DEFAULT 'pz',
    "quantita" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "sogliaMinima" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "ubicazione" TEXT,
    "attivo" BOOLEAN NOT NULL DEFAULT true,
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
];

const client = await pool.connect();
try {
  for (const sql of statements) {
    await client.query(sql);
    console.log("OK:", sql.trim().split("\n")[0]);
  }
  console.log("Schema sincronizzato con successo.");
} catch (error) {
  console.error("Errore sincronizzazione schema:", error);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
