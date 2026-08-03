import "dotenv/config";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const statements = [
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
    console.log("OK:", sql.split("\n")[0]);
  }
  console.log("Migrazione catId su User completata.");
} finally {
  client.release();
  await pool.end();
}
