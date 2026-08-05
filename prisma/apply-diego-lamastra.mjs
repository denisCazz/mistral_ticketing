import "dotenv/config";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const DIEGO_DIPENDENTE_ID = "cmsendfdd000cw8va5awr1mlq";
const DIEGO_USER_ID = "cmseo4rhy000odkva6autdkj9";
const EMAIL_CORRETTA = "diego.lamastra@mistralimpianti.it";

const client = await pool.connect();
try {
  await client.query("BEGIN");

  const clash = await client.query('SELECT id FROM "User" WHERE email = $1', [
    EMAIL_CORRETTA,
  ]);
  if (clash.rowCount > 0) {
    throw new Error(`Email ${EMAIL_CORRETTA} già assegnata a un altro utente`);
  }

  const dip = await client.query(
    'UPDATE "Dipendente" SET nome = $1, cognome = $2, "updatedAt" = NOW() WHERE id = $3 RETURNING id, nome, cognome',
    ["DIEGO", "LA MASTRA", DIEGO_DIPENDENTE_ID]
  );
  if (dip.rowCount !== 1) throw new Error("Dipendente Diego non trovato");

  const user = await client.query(
    'UPDATE "User" SET email = $1, name = $2 WHERE id = $3 RETURNING id, email, name',
    [EMAIL_CORRETTA, "DIEGO LA MASTRA", DIEGO_USER_ID]
  );
  if (user.rowCount !== 1) throw new Error("Utente Diego non trovato");

  await client.query("COMMIT");
  console.log("Dipendente:", dip.rows[0]);
  console.log("User:", user.rows[0]);
  console.log("Correzione Diego La Mastra completata.");
} catch (e) {
  await client.query("ROLLBACK");
  console.error("Annullato:", e.message);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
