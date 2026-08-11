import "dotenv/config";
import { Pool } from "pg";
import { cosineSimilarity } from "../src/lib/vector-math";
import { buildGraphPayload } from "../src/lib/document-similarity";

const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString) {
  throw new Error("TEST_DATABASE_URL obbligatoria");
}
const parsedUrl = new URL(connectionString);
if (!["localhost", "127.0.0.1", "db"].includes(parsedUrl.hostname)) {
  throw new Error(
    `Database test non locale rifiutato: ${parsedUrl.hostname}`
  );
}

const pool = new Pool({ connectionString });
const client = await pool.connect();
const passed: string[] = [];

function assert(condition: unknown, label: string): asserts condition {
  if (!condition) throw new Error(`Verifica fallita: ${label}`);
  passed.push(label);
}

function basisVector(index: number): number[] {
  return Array.from({ length: 1536 }, (_, position) =>
    position === index ? 1 : 0
  );
}

try {
  await client.query("BEGIN");
  const extension = await client.query<{ installed: boolean }>(
    "SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') AS installed"
  );
  assert(extension.rows[0]?.installed, "estensione pgvector disponibile");

  await client.query(`
    CREATE TEMP TABLE verify_vectors (
      id TEXT PRIMARY KEY,
      embedding vector(1536)
    ) ON COMMIT DROP
  `);
  const first = basisVector(0);
  const second = basisVector(1);
  await client.query(
    `INSERT INTO verify_vectors (id, embedding)
     VALUES ('a', $1::vector), ('b', $2::vector)`,
    [`[${first.join(",")}]`, `[${second.join(",")}]`]
  );
  const dimensions = await client.query<{ dimensions: number }>(
    "SELECT vector_dims(embedding)::int AS dimensions FROM verify_vectors LIMIT 1"
  );
  assert(dimensions.rows[0]?.dimensions === 1536, "vettori a 1536 dimensioni");

  await client.query(
    "CREATE INDEX verify_vectors_hnsw ON verify_vectors USING hnsw (embedding vector_cosine_ops)"
  );
  const index = await client.query(
    "SELECT 1 FROM pg_indexes WHERE indexname = 'verify_vectors_hnsw'"
  );
  assert(index.rowCount === 1, "indice HNSW creato");

  const nearest = await client.query<{ id: string }>(
    `SELECT id FROM verify_vectors
     ORDER BY embedding <=> $1::vector
     LIMIT 1`,
    [`[${first.join(",")}]`]
  );
  assert(nearest.rows[0]?.id === "a", "ordine coseno pgvector corretto");

  await client.query(`
    CREATE TEMP TABLE verify_activation (
      id TEXT PRIMARY KEY,
      active_version TEXT NOT NULL
    ) ON COMMIT DROP;
    INSERT INTO verify_activation VALUES ('doc', 'v1');
    SAVEPOINT staging;
    UPDATE verify_activation SET active_version = 'v2' WHERE id = 'doc';
    ROLLBACK TO SAVEPOINT staging;
  `);
  const active = await client.query<{ active_version: string }>(
    "SELECT active_version FROM verify_activation WHERE id = 'doc'"
  );
  assert(
    active.rows[0]?.active_version === "v1",
    "fallimento staging preserva versione attiva"
  );

  assert(
    cosineSimilarity(first, first) > cosineSimilarity(first, second),
    "fallback JSON mantiene il primo risultato"
  );

  await client.query(`
    CREATE TEMP TABLE verify_jobs (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    ) ON COMMIT DROP;
    INSERT INTO verify_jobs (id, status) VALUES ('j1', 'PENDING'), ('j2', 'PENDING');
  `);
  const claim = async () =>
    client.query<{ id: string }>(`
      WITH candidate AS (
        SELECT id FROM verify_jobs
        WHERE status = 'PENDING'
        ORDER BY created_at, id
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      UPDATE verify_jobs AS job
      SET status = 'RUNNING'
      FROM candidate
      WHERE job.id = candidate.id
      RETURNING job.id
    `);
  const claimedFirst = await claim();
  const claimedSecond = await claim();
  assert(
    claimedFirst.rows[0]?.id !== claimedSecond.rows[0]?.id,
    "claim successivi selezionano job diversi"
  );

  const graph = buildGraphPayload({
    documents: [
      {
        id: "a",
        title: "A",
        category: "TEST",
        activeVersion: "v2",
        chunkCount: 1,
        status: "READY",
        documentDate: null,
        expiryDate: null,
      },
      {
        id: "b",
        title: "B",
        category: "TEST",
        activeVersion: "v2",
        chunkCount: 1,
        status: "READY",
        documentDate: null,
        expiryDate: null,
      },
    ],
    edges: [
      {
        sourceDocumentoId: "a",
        targetDocumentoId: "b",
        sourceVersion: "v1",
        targetVersion: "v2",
        score: 0.9,
      },
    ],
  });
  assert(graph.links.length === 0, "archi obsoleti esclusi");

  console.log(`Verifiche database superate: ${passed.length}`);
  for (const label of passed) console.log(`OK ${label}`);
} finally {
  await client.query("ROLLBACK").catch(() => undefined);
  client.release();
  await pool.end();
}
