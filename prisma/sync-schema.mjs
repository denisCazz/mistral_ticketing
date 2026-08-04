import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const statements = [
  // Drop legacy Pratica tables if present
  `DROP TABLE IF EXISTS "PraticaStoria" CASCADE;`,
  `DROP TABLE IF EXISTS "Pratica" CASCADE;`,
  `DROP TABLE IF EXISTS "Cat" CASCADE;`,

  // Remove legacy Rapportino.praticaId if present
  `ALTER TABLE "Rapportino" DROP COLUMN IF EXISTS "praticaId";`,
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
