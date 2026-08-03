import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const statements = [
  // Cat table (new installs)
  `CREATE TABLE IF NOT EXISTS "Cat" (
    "id" TEXT NOT NULL,
    "ragioneSociale" TEXT NOT NULL,
    "referenti" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "emails" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "telefono" TEXT,
    "indirizzo" TEXT,
    "cap" TEXT,
    "citta" TEXT,
    "provincia" TEXT,
    "note" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sourceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Cat_pkey" PRIMARY KEY ("id")
  );`,
  `CREATE INDEX IF NOT EXISTS "Cat_ragioneSociale_idx" ON "Cat"("ragioneSociale");`,

  // Migrate legacy Cat columns (email/referente -> emails/referenti)
  `ALTER TABLE "Cat" ADD COLUMN IF NOT EXISTS "emails" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];`,
  `ALTER TABLE "Cat" ADD COLUMN IF NOT EXISTS "referenti" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];`,
  `DO $$
   BEGIN
     IF EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_name = 'Cat' AND column_name = 'email'
     ) THEN
       UPDATE "Cat"
       SET "emails" = ARRAY["email"]
       WHERE "email" IS NOT NULL AND "email" <> '' AND cardinality("emails") = 0;
       DROP INDEX IF EXISTS "Cat_email_idx";
       ALTER TABLE "Cat" DROP COLUMN "email";
     END IF;
   END $$;`,
  `DO $$
   BEGIN
     IF EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_name = 'Cat' AND column_name = 'referente'
     ) THEN
       UPDATE "Cat"
       SET "referenti" = ARRAY["referente"]
       WHERE "referente" IS NOT NULL AND "referente" <> '' AND cardinality("referenti") = 0;
       ALTER TABLE "Cat" DROP COLUMN "referente";
     END IF;
   END $$;`,

  // Pratica.catId
  `ALTER TABLE "Pratica" ADD COLUMN IF NOT EXISTS "catId" TEXT;`,
  `CREATE INDEX IF NOT EXISTS "Pratica_catId_idx" ON "Pratica"("catId");`,
  `DO $$
   BEGIN
     IF NOT EXISTS (
       SELECT 1 FROM pg_constraint WHERE conname = 'Pratica_catId_fkey'
     ) THEN
       ALTER TABLE "Pratica"
         ADD CONSTRAINT "Pratica_catId_fkey"
         FOREIGN KEY ("catId") REFERENCES "Cat"("id")
         ON DELETE SET NULL ON UPDATE CASCADE;
     END IF;
   END $$;`,

  // User.catId
  `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "catId" TEXT;`,
  `CREATE INDEX IF NOT EXISTS "User_catId_idx" ON "User"("catId");`,
  `DO $$
   BEGIN
     IF NOT EXISTS (
       SELECT 1 FROM pg_constraint WHERE conname = 'User_catId_fkey'
     ) THEN
       ALTER TABLE "User"
         ADD CONSTRAINT "User_catId_fkey"
         FOREIGN KEY ("catId") REFERENCES "Cat"("id")
         ON DELETE SET NULL ON UPDATE CASCADE;
     END IF;
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
