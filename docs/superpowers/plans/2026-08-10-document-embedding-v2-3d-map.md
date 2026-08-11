# Document Embedding v2 and 3D Map Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a measurable embedding-v2 pipeline with safe re-indexing, automatic jobs, pgvector retrieval with JSON fallback, and an admin-only 3D document similarity map.

**Architecture:** Existing JSON chunks remain searchable while a versioned staging generation is built. PostgreSQL owns queue state and active-generation pointers; optional pgvector columns and indexes are installed outside Prisma-managed columns so deployments without extension privileges still run in degraded JSON mode. Document centroids create persistent top-neighbor edges consumed by a bounded WebGL graph API.

**Tech Stack:** Next.js 16.2 App Router, React 19, TypeScript, Prisma 7/PostgreSQL 16, optional pgvector/HNSW, OpenAI `text-embedding-3-small`, Vitest 4, `js-tiktoken`, `react-force-graph-3d`, Three.js.

## Global Constraints

- Active embedding profile is `document-v2` with exactly 1,536 dimensions.
- Structure-aware chunks target 800–1,200 tokens with approximately 120 overlap tokens.
- Re-indexing existing documents defaults to embedding-only; OCR and structured extraction are not rerun.
- A failed rebuild must preserve the previous active generation.
- Native retrieval must preserve the HR authorization policy from `src/lib/access.ts`.
- JSON embeddings remain populated and searchable when pgvector is unavailable.
- The graph returns no raw vectors or chunk text and is limited to 1,000 nodes.
- Only canonical, AI-whitelisted documents receive embeddings and graph nodes.
- Full reprocessing requires explicit admin confirmation.
- Quality gate: no Recall@5 or MRR regression, with a target of 10% relative Recall@5 improvement.

---

## File Map

New focused modules:

- `src/lib/document-embedding-profile.ts`: active profile, staleness, token/model invariants.
- `src/lib/document-chunker.ts`: normalization, structural splitting, metadata context, hashes.
- `src/lib/vector-math.ts`: cosine, normalization, weighted centroid, RRF.
- `src/lib/pgvector.ts`: capability detection and native vector writes/queries.
- `src/lib/document-indexer.ts`: staging generation, validation, centroid, atomic activation.
- `src/lib/document-ai-jobs.ts`: enqueue, lease, retry, reconcile, worker job execution.
- `src/lib/document-similarity.ts`: nearest-document edges and graph payload.
- `scripts/document-ai-worker.ts`: continuous queue worker.
- `scripts/build-retrieval-gold.ts`: historical/synthetic evaluation set builder.
- `scripts/evaluate-retrieval.ts`: Recall@5, MRR, rank-1, latency, diversity report.
- `src/app/api/admin/documenti-ai/map/route.ts`: bounded admin graph API.
- `src/components/documenti-ai/processing-panel.tsx`: queue controls, stats, durable logs.
- `src/components/documenti-ai/document-map-panel.tsx`: map filters and loading states.
- `src/components/documenti-ai/document-map-3d.tsx`: client-only WebGL renderer.

Existing orchestration files stay thin:

- `src/lib/rag.ts` exposes the new retrieval/indexing facade.
- `src/lib/document-ai-batch.ts` delegates embedding work to the indexer/jobs.
- `src/app/(app)/admin/documenti-ai/page.tsx` becomes a tab shell.

---

### Task 1: Versioned persistence and optional pgvector bootstrap

**Files:**
- Create: `prisma/migrations/20260810170000_embedding_v2/migration.sql`
- Create: `src/lib/document-embedding-profile.ts`
- Create: `src/lib/__tests__/document-embedding-profile.test.ts`
- Modify: `prisma/schema.prisma:29-49,318-390`
- Modify: `prisma/sync-schema.mjs:71-85`
- Modify: `src/lib/config.ts:6-22`
- Modify: `.env.example:26-35`
- Modify: `docker-compose.yml:1-42`

**Interfaces:**
- Produces: `DOCUMENT_EMBEDDING_PROFILE`, `DocumentEmbeddingProfile`, `isEmbeddingStale(document)`.
- Produces Prisma models: `DocumentoEmbedding`, `DocumentoSimilarity`, `DocumentoAiJob`.
- Produces optional database columns `"DocumentoChunk"."embeddingVector"` and `"DocumentoEmbedding"."centroidVector"`, accessed only through raw SQL.

- [ ] **Step 1: Write profile tests**

```ts
import { describe, expect, it } from "vitest";
import {
  DOCUMENT_EMBEDDING_PROFILE,
  isEmbeddingStale,
} from "@/lib/document-embedding-profile";

describe("document embedding profile", () => {
  it("locks v2 to 1536 dimensions", () => {
    expect(DOCUMENT_EMBEDDING_PROFILE).toMatchObject({
      version: "document-v2",
      dimensions: 1536,
      targetTokens: 1000,
      maxTokens: 1200,
      overlapTokens: 120,
    });
  });

  it("marks a missing or different active profile as stale", () => {
    expect(isEmbeddingStale({ aiWhitelist: true, embeddingActiveProfile: null }))
      .toBe(true);
    expect(
      isEmbeddingStale({
        aiWhitelist: true,
        embeddingActiveProfile: "document-v1",
      })
    ).toBe(true);
    expect(
      isEmbeddingStale({
        aiWhitelist: true,
        embeddingActiveProfile: "document-v2",
      })
    ).toBe(false);
    expect(isEmbeddingStale({ aiWhitelist: false, embeddingActiveProfile: null }))
      .toBe(false);
  });
});
```

- [ ] **Step 2: Run the focused test and confirm the missing module**

Run: `npx vitest run src/lib/__tests__/document-embedding-profile.test.ts`

Expected: FAIL because `@/lib/document-embedding-profile` does not exist.

- [ ] **Step 3: Add the profile and configuration**

Add to `src/lib/config.ts`:

```ts
export const OPENAI_EMBEDDING_DIMENSIONS = 1536 as const;
export const DOCUMENT_EMBEDDING_VERSION =
  process.env.DOCUMENT_EMBEDDING_VERSION ?? "document-v2";
export const DOCUMENT_AI_WORKER_POLL_MS = Math.max(
  500,
  Number(process.env.DOCUMENT_AI_WORKER_POLL_MS ?? 2000)
);
export const DOCUMENT_EMBEDDING_RETENTION_DAYS = Math.max(
  1,
  Number(process.env.DOCUMENT_EMBEDDING_RETENTION_DAYS ?? 14)
);
export const DOCUMENT_EMBEDDING_CLEANUP_ENABLED =
  process.env.DOCUMENT_EMBEDDING_CLEANUP_ENABLED === "true";
export const DOCUMENT_SIMILARITY_MIN = Math.min(
  1,
  Math.max(0, Number(process.env.DOCUMENT_SIMILARITY_MIN ?? 0.72))
);
```

Create `src/lib/document-embedding-profile.ts`:

```ts
import {
  DOCUMENT_EMBEDDING_VERSION,
  OPENAI_EMBEDDING_DIMENSIONS,
  OPENAI_EMBEDDING_MODEL,
} from "@/lib/config";

export type DocumentEmbeddingProfile = {
  version: string;
  model: string;
  dimensions: 1536;
  targetTokens: number;
  maxTokens: number;
  overlapTokens: number;
  normalizationVersion: string;
};

export const DOCUMENT_EMBEDDING_PROFILE: DocumentEmbeddingProfile = {
  version: DOCUMENT_EMBEDDING_VERSION,
  model: OPENAI_EMBEDDING_MODEL,
  dimensions: OPENAI_EMBEDDING_DIMENSIONS,
  targetTokens: 1000,
  maxTokens: 1200,
  overlapTokens: 120,
  normalizationVersion: "document-text-v2",
};

export function isEmbeddingStale(document: {
  aiWhitelist: boolean;
  embeddingActiveProfile: string | null;
}): boolean {
  return (
    document.aiWhitelist &&
    document.embeddingActiveProfile !== DOCUMENT_EMBEDDING_PROFILE.version
  );
}
```

- [ ] **Step 4: Extend the Prisma schema**

Add enums:

```prisma
enum EmbeddingStatus {
  PENDING
  INDEXING
  READY
  FAILED
}

enum DocumentoAiJobType {
  FULL_PIPELINE
  EMBEDDING_ONLY
  FULL_REPROCESS
}

enum DocumentoAiJobStatus {
  PENDING
  RUNNING
  PAUSED
  COMPLETED
  FAILED
}
```

Add to `Documento`:

```prisma
embeddingDesiredVersion String?
embeddingActiveProfile  String?
embeddingActiveVersion  String?
embeddingStatus         EmbeddingStatus @default(PENDING)
embeddingIndexedAt      DateTime?
embeddingLastError      String?
embeddingGenerations    DocumentoEmbedding[]
similaritySources       DocumentoSimilarity[] @relation("SimilaritySource")
similarityTargets       DocumentoSimilarity[] @relation("SimilarityTarget")
aiJobs                   DocumentoAiJob[]
```

Replace `DocumentoChunk` with the backward-compatible versioned shape:

```prisma
model DocumentoChunk {
  id               String   @id @default(cuid())
  documentoId      String
  content           String
  embedding         Json?
  metadata          Json?
  embeddingProfile  String   @default("document-v1")
  embeddingVersion  String   @default("document-v1")
  chunkIndex        Int      @default(0)
  contentHash       String   @default("")
  tokenCount        Int      @default(0)
  pageFrom          Int?
  pageTo            Int?
  sectionTitle      String?
  createdAt         DateTime @default(now())

  documento Documento @relation(fields: [documentoId], references: [id], onDelete: Cascade)

  @@unique([documentoId, embeddingVersion, chunkIndex])
  @@index([documentoId])
  @@index([embeddingProfile])
  @@index([embeddingVersion])
}

model DocumentoEmbedding {
  id               String   @id @default(cuid())
  documentoId      String
  embeddingProfile String
  embeddingVersion String
  centroid         Json
  model             String
  dimensions        Int
  chunkCount        Int
  createdAt         DateTime @default(now())

  documento Documento @relation(fields: [documentoId], references: [id], onDelete: Cascade)

  @@unique([documentoId, embeddingVersion])
  @@index([embeddingProfile])
}

model DocumentoSimilarity {
  id                  String   @id @default(cuid())
  sourceDocumentoId   String
  targetDocumentoId   String
  sourceVersion       String
  targetVersion       String
  score               Float
  updatedAt           DateTime @updatedAt

  source Documento @relation("SimilaritySource", fields: [sourceDocumentoId], references: [id], onDelete: Cascade)
  target Documento @relation("SimilarityTarget", fields: [targetDocumentoId], references: [id], onDelete: Cascade)

  @@unique([sourceDocumentoId, targetDocumentoId])
  @@index([sourceDocumentoId, score])
  @@index([targetDocumentoId])
}

model DocumentoAiJob {
  id             String                @id @default(cuid())
  documentoId    String
  type           DocumentoAiJobType
  targetVersion  String
  status         DocumentoAiJobStatus  @default(PENDING)
  attempts       Int                   @default(0)
  maxAttempts    Int                   @default(3)
  nextRunAt      DateTime              @default(now())
  leaseOwner     String?
  leaseExpiresAt DateTime?
  lastError      String?
  tokenCount     Int                   @default(0)
  startedAt      DateTime?
  completedAt    DateTime?
  createdAt      DateTime              @default(now())
  updatedAt      DateTime              @updatedAt

  documento Documento @relation(fields: [documentoId], references: [id], onDelete: Cascade)

  @@unique([documentoId, type, targetVersion])
  @@index([status, nextRunAt])
  @@index([leaseExpiresAt])
}
```

- [ ] **Step 5: Write the regular migration**

The migration must create the enums/models, add regular columns, rank existing chunks per document with `row_number()`, tag them `document-v1`, and initialize documents:

```sql
ALTER TABLE "DocumentoChunk"
  ADD COLUMN "embeddingProfile" TEXT NOT NULL DEFAULT 'document-v1',
  ADD COLUMN "embeddingVersion" TEXT NOT NULL DEFAULT 'document-v1',
  ADD COLUMN "chunkIndex" INTEGER,
  ADD COLUMN "contentHash" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "tokenCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "pageFrom" INTEGER,
  ADD COLUMN "pageTo" INTEGER,
  ADD COLUMN "sectionTitle" TEXT;

WITH ranked AS (
  SELECT id, row_number() OVER (
    PARTITION BY "documentoId" ORDER BY "createdAt", id
  ) - 1 AS position
  FROM "DocumentoChunk"
)
UPDATE "DocumentoChunk" c
SET "chunkIndex" = ranked.position,
    "contentHash" = md5(c.content),
    "tokenCount" = CEIL(length(c.content) / 4.0)::INTEGER
FROM ranked
WHERE ranked.id = c.id;

ALTER TABLE "DocumentoChunk"
  ALTER COLUMN "chunkIndex" SET NOT NULL,
  ALTER COLUMN "chunkIndex" SET DEFAULT 0;

UPDATE "Documento" d
SET "embeddingActiveProfile" = 'document-v1',
    "embeddingActiveVersion" = 'document-v1',
    "embeddingStatus" = 'READY'
WHERE EXISTS (
  SELECT 1 FROM "DocumentoChunk" c WHERE c."documentoId" = d.id
);

UPDATE "Documento"
SET "embeddingDesiredVersion" = 'document-v2'
WHERE "aiWhitelist" = true;

CREATE INDEX "DocumentoChunk_fts_it_idx"
ON "DocumentoChunk"
USING GIN (to_tsvector('italian', content));
```

Include all foreign keys and indexes represented in the Prisma schema. Run `npx prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script` only as a reference; keep the hand-written backfill and idempotent existing-data handling.

- [ ] **Step 6: Mirror deployment DDL and add optional pgvector bootstrap**

Before the vector statements, extend `prisma/sync-schema.mjs` with idempotent
regular DDL for container startup:

1. create `EmbeddingStatus`, `DocumentoAiJobType`, and
   `DocumentoAiJobStatus` in guarded `DO` blocks;
2. add all six embedding columns to `Documento` with `ADD COLUMN IF NOT EXISTS`;
3. add the seven version/chunk columns to `DocumentoChunk`, backfill null
   `chunkIndex`, `contentHash`, and `tokenCount`, then add the compound unique
   index;
4. create `DocumentoEmbedding`, `DocumentoSimilarity`, and `DocumentoAiJob`
   with `CREATE TABLE IF NOT EXISTS`;
5. create their unique/lookup indexes with `CREATE INDEX IF NOT EXISTS`;
6. add each foreign key in a `DO` block that catches `duplicate_object`;
7. tag documents that already have chunks as active `document-v1` and set
   whitelisted documents without a desired profile to `document-v2`.

This list is required because the production container currently starts with
`node prisma/sync-schema.mjs` instead of `prisma migrate deploy`.

Append guarded statements to `prisma/sync-schema.mjs`:

```js
`DO $$ BEGIN
  CREATE EXTENSION IF NOT EXISTS vector;
EXCEPTION
  WHEN insufficient_privilege OR undefined_file THEN
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
```

Keep these optional columns out of `schema.prisma`; Prisma manages the JSON fallback and raw SQL manages vectors.

- [ ] **Step 7: Configure Docker and environment**

Change the database image to `pgvector/pgvector:pg16`. Add these documented environment values to `.env.example` and app/worker configuration:

```dotenv
DOCUMENT_EMBEDDING_VERSION=document-v2
DOCUMENT_AI_WORKER_POLL_MS=2000
DOCUMENT_EMBEDDING_RETENTION_DAYS=14
DOCUMENT_EMBEDDING_CLEANUP_ENABLED=false
DOCUMENT_SIMILARITY_MIN=0.72
```

- [ ] **Step 8: Validate schema and tests**

Run:

```powershell
npx prisma format
npx prisma validate
npx prisma generate
npx vitest run src/lib/__tests__/document-embedding-profile.test.ts
```

Expected: Prisma validation succeeds and both profile tests pass.

- [ ] **Step 9: Commit**

```powershell
git add prisma/schema.prisma prisma/migrations/20260810170000_embedding_v2/migration.sql prisma/sync-schema.mjs src/lib/config.ts src/lib/document-embedding-profile.ts src/lib/__tests__/document-embedding-profile.test.ts .env.example docker-compose.yml
git commit -m "feat: add versioned embedding storage"
```

---

### Task 2: Structure-aware chunks and vector math

**Files:**
- Create: `src/lib/document-chunker.ts`
- Create: `src/lib/vector-math.ts`
- Create: `src/lib/__tests__/document-chunker.test.ts`
- Create: `src/lib/__tests__/vector-math.test.ts`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Consumes: `DocumentEmbeddingProfile`.
- Produces: `buildDocumentChunks(input): PreparedDocumentChunk[]`.
- Produces: `normalizedWeightedCentroid(vectors): number[]`, `reciprocalRankFusion`.

- [ ] **Step 1: Install the tokenizer**

Run: `npm install js-tiktoken`

Expected: `package.json` and `package-lock.json` add `js-tiktoken` at the latest compatible release.

- [ ] **Step 2: Write chunking tests**

```ts
import { describe, expect, it } from "vitest";
import { buildDocumentChunks } from "@/lib/document-chunker";

describe("buildDocumentChunks", () => {
  it("keeps page metadata and embeds contextual metadata without changing display content", () => {
    const chunks = buildDocumentChunks({
      pages: [
        { pageNumber: 1, content: "SICUREZZA\n\nCorso antincendio completato." },
        { pageNumber: 2, content: "Scadenza attestato: 10/08/2028." },
      ],
      context: {
        title: "Attestato Rossi.pdf",
        category: "FORMAZIONE",
        subcategory: "ANTINCENDIO",
        entityLabel: "Mario Rossi",
        documentDate: null,
        expiryDate: "2028-08-10",
      },
    });

    expect(chunks[0].content).not.toContain("Documento: Attestato Rossi.pdf");
    expect(chunks[0].embeddingInput).toContain("Documento: Attestato Rossi.pdf");
    expect(chunks.some((chunk) => chunk.pageTo === 2)).toBe(true);
    expect(chunks.every((chunk) => chunk.tokenCount <= 1200)).toBe(true);
  });

  it("produces stable hashes and overlap for long input", () => {
    const paragraph = "Manutenzione periodica impianto antincendio. ".repeat(120);
    const input = {
      pages: [{ pageNumber: 1, content: paragraph }],
      context: {
        title: "Manuale.pdf",
        category: "TECNICO",
        subcategory: null,
        entityLabel: null,
        documentDate: null,
        expiryDate: null,
      },
    };
    const first = buildDocumentChunks(input);
    const second = buildDocumentChunks(input);
    expect(first.length).toBeGreaterThan(1);
    expect(first.map((chunk) => chunk.contentHash)).toEqual(
      second.map((chunk) => chunk.contentHash)
    );
  });
});
```

- [ ] **Step 3: Write vector-math tests**

```ts
import { describe, expect, it } from "vitest";
import {
  cosineSimilarity,
  normalizedWeightedCentroid,
  reciprocalRankFusion,
} from "@/lib/vector-math";

describe("vector math", () => {
  it("normalizes a weighted centroid", () => {
    const centroid = normalizedWeightedCentroid([
      { vector: [1, 0], weight: 2 },
      { vector: [0, 1], weight: 1 },
    ]);
    expect(Math.hypot(...centroid)).toBeCloseTo(1, 8);
    expect(centroid[0]).toBeGreaterThan(centroid[1]);
  });

  it("fuses vector and lexical ranks", () => {
    const fused = reciprocalRankFusion(
      ["a", "b", "c"],
      ["b", "c", "d"],
      60
    );
    expect(fused[0].id).toBe("b");
    expect(cosineSimilarity([1, 0], [1, 0])).toBe(1);
  });
});
```

- [ ] **Step 4: Run tests and confirm missing exports**

Run:

```powershell
npx vitest run src/lib/__tests__/document-chunker.test.ts src/lib/__tests__/vector-math.test.ts
```

Expected: FAIL because the two modules do not exist.

- [ ] **Step 5: Implement the chunker**

Use `getEncoding("cl100k_base")` from `js-tiktoken`. Export these exact types:

```ts
export type DocumentPageInput = { pageNumber: number | null; content: string };

export type DocumentChunkContext = {
  title: string;
  category: string;
  subcategory: string | null;
  entityLabel: string | null;
  documentDate: string | null;
  expiryDate: string | null;
};

export type PreparedDocumentChunk = {
  index: number;
  content: string;
  embeddingInput: string;
  contentHash: string;
  tokenCount: number;
  pageFrom: number | null;
  pageTo: number | null;
  sectionTitle: string | null;
};

export function buildDocumentChunks(input: {
  pages: DocumentPageInput[];
  context: DocumentChunkContext;
}): PreparedDocumentChunk[];
```

Implementation rules:

```ts
const HEADING = /^(?:[A-ZÀ-Ü0-9][A-ZÀ-Ü0-9 /'’().:-]{3,}|#{1,6}\s+.+)$/;

function contextualPrefix(context: DocumentChunkContext, section: string | null) {
  return [
    `Documento: ${context.title}`,
    `Categoria: ${context.category}${context.subcategory ? ` / ${context.subcategory}` : ""}`,
    context.entityLabel ? `Entità: ${context.entityLabel}` : null,
    context.documentDate ? `Data documento: ${context.documentDate}` : null,
    context.expiryDate ? `Scadenza: ${context.expiryDate}` : null,
    section ? `Sezione: ${section}` : null,
  ].filter(Boolean).join("\n");
}
```

Normalize NUL/CRLF/whitespace, split pages into heading/paragraph/sentence units, aggregate to the 1,000-token target, split before 1,200 tokens, and seed the next chunk with whole trailing units totaling at most 120 tokens. Hash `normalizationVersion + "\n" + embeddingInput` with `createHash("sha256")`.

- [ ] **Step 6: Implement vector math**

`src/lib/vector-math.ts` must reject mismatched dimensions, non-finite values, and empty vectors. `normalizedWeightedCentroid` uses `Math.max(0.25, Math.min(1, tokenCount / 200))` as the chunk weight in callers. `reciprocalRankFusion` returns descending `{ id, score }` entries using `1 / (k + rank)`.

- [ ] **Step 7: Run focused tests**

Run:

```powershell
npx vitest run src/lib/__tests__/document-chunker.test.ts src/lib/__tests__/vector-math.test.ts
npm run typecheck
```

Expected: all focused tests pass and TypeScript reports no errors.

- [ ] **Step 8: Commit**

```powershell
git add package.json package-lock.json src/lib/document-chunker.ts src/lib/vector-math.ts src/lib/__tests__/document-chunker.test.ts src/lib/__tests__/vector-math.test.ts
git commit -m "feat: add contextual document chunking"
```

---

### Task 3: Safe versioned indexing and vector writes

**Files:**
- Create: `src/lib/pgvector.ts`
- Create: `src/lib/document-indexer.ts`
- Create: `src/lib/__tests__/document-indexer.test.ts`
- Modify: `src/lib/openai.ts:37-59`
- Modify: `src/lib/rag.ts:185-258`
- Modify: `src/lib/document-ai-batch.ts:289-366`
- Modify: `src/app/api/documenti/[id]/index/route.ts:1-29`
- Modify: `scripts/process-documenti.ts:247-275`

**Interfaces:**
- Consumes: `buildDocumentChunks`, `normalizedWeightedCentroid`, Prisma versioned models.
- Produces: `indexDocumento(documentoId, options): Promise<IndexDocumentResult>`.
- Produces: `getPgvectorCapability(): Promise<{ available: boolean; reason: string | null }>`.

- [ ] **Step 1: Write indexer tests with injected dependencies**

```ts
import { describe, expect, it, vi } from "vitest";
import { createDocumentIndexer } from "@/lib/document-indexer";

describe("document indexer", () => {
  it("activates only after every vector validates", async () => {
    const activate = vi.fn();
    const indexer = createDocumentIndexer({
      loadDocument: vi.fn().mockResolvedValue({
        id: "doc-1",
        aiWhitelist: true,
        title: "Manuale.pdf",
        category: "TECNICO",
        subcategory: null,
        entityLabel: null,
        documentDate: null,
        expiryDate: null,
        pages: [{ pageNumber: 1, content: "Manutenzione estintori." }],
      }),
      embed: vi.fn().mockResolvedValue({
        embeddings: [Array(1536).fill(0.01)],
        tokens: 12,
      }),
      persistAndActivate: activate,
      markFailed: vi.fn(),
    });

    const result = await indexer.index("doc-1");
    expect(result.chunkCount).toBe(1);
    expect(activate).toHaveBeenCalledOnce();
  });

  it("does not activate an invalid vector generation", async () => {
    const activate = vi.fn();
    const markFailed = vi.fn();
    const indexer = createDocumentIndexer({
      loadDocument: vi.fn().mockResolvedValue({
        id: "doc-1",
        aiWhitelist: true,
        title: "Manuale.pdf",
        category: "TECNICO",
        subcategory: null,
        entityLabel: null,
        documentDate: null,
        expiryDate: null,
        pages: [{ pageNumber: 1, content: "Manutenzione estintori." }],
      }),
      embed: vi.fn().mockResolvedValue({
        embeddings: [[1, 2]],
        tokens: 2,
      }),
      persistAndActivate: activate,
      markFailed,
    });

    await expect(indexer.index("doc-1")).rejects.toThrow("dimension");
    expect(activate).not.toHaveBeenCalled();
    expect(markFailed).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run the focused test**

Run: `npx vitest run src/lib/__tests__/document-indexer.test.ts`

Expected: FAIL because `createDocumentIndexer` does not exist.

- [ ] **Step 3: Make embedding dimensions explicit**

Change `embedTexts` to:

```ts
export async function embedTexts(
  texts: string[],
  options: {
    model?: string;
    dimensions?: number;
  } = {}
): Promise<EmbedResult> {
  const client = getOpenAi();
  const res = await client.embeddings.create({
    model: options.model ?? OPENAI_EMBEDDING_MODEL,
    input: texts,
    dimensions: options.dimensions ?? OPENAI_EMBEDDING_DIMENSIONS,
  });
  return {
    embeddings: res.data.map((item) => item.embedding),
    tokens: res.usage?.total_tokens ?? 0,
  };
}
```

Import `OPENAI_EMBEDDING_DIMENSIONS` from config. Keep `embedText` delegating to this function.

- [ ] **Step 4: Implement pgvector capability and writes**

`src/lib/pgvector.ts` must:

```ts
export type PgvectorCapability = {
  available: boolean;
  reason: string | null;
};

export async function getPgvectorCapability(): Promise<PgvectorCapability>;
export function vectorLiteral(vector: number[], dimensions = 1536): string;
export async function writeChunkVector(
  tx: Prisma.TransactionClient,
  chunkId: string,
  vector: number[]
): Promise<void>;
export async function writeCentroidVector(
  tx: Prisma.TransactionClient,
  embeddingId: string,
  vector: number[]
): Promise<void>;
```

Capability requires the `vector` extension and both optional columns in `information_schema.columns`. Cache success for 60 seconds; cache failure for 10 seconds. `vectorLiteral` validates length and finite values before producing `[0.1,0.2,...]`. Writes use parameterized raw SQL with `${literal}::vector`.

- [ ] **Step 5: Implement the dependency-injected indexer**

Export:

```ts
export type IndexDocumentResult = {
  documentoId: string;
  profile: string;
  version: string;
  chunkCount: number;
  tokenCount: number;
  vectorMode: "pgvector" | "json";
};

export function createDocumentIndexer(deps: IndexerDependencies): {
  index(documentoId: string): Promise<IndexDocumentResult>;
};

export async function indexDocumento(
  documentoId: string
): Promise<IndexDocumentResult>;
```

The production dependency implementation must:

1. load `Documento`, ordered `testi`, linked employee/vehicle labels, and existing text;
2. reject non-whitelisted or empty-text documents;
3. set `embeddingStatus = INDEXING` without touching active fields;
4. build chunks and call OpenAI in batches of 64 embedding inputs;
5. validate one 1,536-dimensional finite vector per chunk;
6. create a `randomUUID()` generation;
7. calculate weighted normalized centroid;
8. in one Prisma transaction create JSON chunks and centroid, optionally write native vectors, then update the document active profile/version/status/timestamp;
9. on failure set `embeddingStatus = FAILED` and `embeddingLastError`, preserving active profile/version.

The transactional activation update must be:

```ts
await tx.documento.update({
  where: { id: document.id },
  data: {
    embeddingDesiredVersion: profile.version,
    embeddingActiveProfile: profile.version,
    embeddingActiveVersion: generation,
    embeddingStatus: "READY",
    embeddingIndexedAt: new Date(),
    embeddingLastError: null,
    statoIngestione: "READY",
  },
});
```

- [ ] **Step 6: Replace destructive indexing callers**

Make `rag.ts#indexDocumentoChunks` a compatibility wrapper:

```ts
export async function indexDocumentoChunks(documentoId: string): Promise<number> {
  const result = await indexDocumento(documentoId);
  return result.chunkCount;
}
```

Update batch, single-index route, and CLI to report `profile`, `version`, `tokenCount`, and `vectorMode` where their result types permit. Remove every pre-index `deleteMany` call. Stale generations are retained until rollout cleanup.

- [ ] **Step 7: Run focused and existing tests**

Run:

```powershell
npx vitest run src/lib/__tests__/document-indexer.test.ts src/lib/__tests__/core.test.ts
npm run typecheck
```

Expected: tests and typecheck pass.

- [ ] **Step 8: Commit**

```powershell
git add src/lib/pgvector.ts src/lib/document-indexer.ts src/lib/__tests__/document-indexer.test.ts src/lib/openai.ts src/lib/rag.ts src/lib/document-ai-batch.ts src/app/api/documenti/[id]/index/route.ts scripts/process-documenti.ts
git commit -m "feat: index documents with atomic generations"
```

---

### Task 4: Native hybrid retrieval with authorized JSON fallback

**Files:**
- Create: `src/lib/document-retrieval.ts`
- Create: `src/lib/__tests__/document-retrieval.test.ts`
- Modify: `src/lib/rag.ts:1-193`
- Modify: `src/app/api/documenti/chat/route.ts:45-78`
- Modify: `src/app/api/preventivi/genera/route.ts:49-80`
- Modify: `src/app/api/preventivi/[id]/genera/route.ts:46-83`

**Interfaces:**
- Consumes: active document generation, pgvector capability, `DOCUMENTI_HR_CATEGORIE`.
- Produces: `searchDocumentChunks(params): Promise<DocumentSearchResponse>`.

- [ ] **Step 1: Write rank fusion and scope tests**

```ts
import { describe, expect, it } from "vitest";
import {
  filterAuthorizedCandidates,
  normalizeFusedResults,
} from "@/lib/document-retrieval";

describe("document retrieval", () => {
  it("removes HR documents for non-admin scope", () => {
    const rows = [
      { id: "a", entityType: "AZIENDA", categoria: "TECNICO" },
      { id: "b", entityType: "DIPENDENTE", categoria: "FORMAZIONE" },
      { id: "c", entityType: "AZIENDA", categoria: "DURC" },
    ];
    expect(
      filterAuthorizedCandidates(rows, { canAccessHr: false }).map((row) => row.id)
    ).toEqual(["a"]);
  });

  it("normalizes fused scores without losing cosine similarity", () => {
    const rows = normalizeFusedResults([
      { id: "a", fusedScore: 0.03, similarity: 0.82 },
      { id: "b", fusedScore: 0.02, similarity: 0.74 },
    ]);
    expect(rows[0].relevance).toBe(1);
    expect(rows[1].relevance).toBeCloseTo(2 / 3);
    expect(rows[0].similarity).toBe(0.82);
  });
});
```

- [ ] **Step 2: Run the focused test**

Run: `npx vitest run src/lib/__tests__/document-retrieval.test.ts`

Expected: FAIL because the retrieval module does not exist.

- [ ] **Step 3: Define the retrieval contract**

```ts
export type DocumentSearchScope = { canAccessHr: boolean };

export type DocumentSearchChunk = {
  id: string;
  documentoId: string;
  content: string;
  titolo: string;
  similarity: number;
  relevance: number;
};

export type DocumentSearchResponse = {
  chunks: DocumentSearchChunk[];
  mode: "pgvector" | "json";
};

export async function searchDocumentChunks(params: {
  embedding: number[];
  query: string;
  limit: number;
  scope: DocumentSearchScope;
}): Promise<DocumentSearchResponse>;
```

- [ ] **Step 4: Implement native RRF retrieval**

Use a parameterized Prisma SQL query with:

- active-generation join: `c."embeddingVersion" = d."embeddingActiveVersion"`;
- canonical, whitelist, and `READY` filters;
- HR SQL clause built from `Prisma.sql` and `Prisma.join(DOCUMENTI_HR_CATEGORIE)`;
- vector candidates ordered by `c."embeddingVector" <=> ${vector}::vector`;
- lexical candidates ordered by `ts_rank_cd(to_tsvector('italian', c.content), websearch_to_tsquery('italian', ${query}))`;
- 64 candidates from each ranking;
- RRF constant 60;
- returned cosine similarity plus normalized fused relevance.

Never interpolate query text, IDs, categories, or vectors into raw SQL strings. `vectorLiteral` is validated before being passed as a bound parameter.

- [ ] **Step 5: Implement active-generation JSON fallback**

Reuse paged Prisma reads, but select each document's `embeddingActiveVersion` and discard chunks whose version does not match it. Apply `documentiHrWhere(scope.canAccessHr)` in the Prisma relation filter, compute cosine in memory, lexical score, and document diversity. Return `mode: "json"`.

If native SQL fails with an undefined extension/column/operator error, invalidate the pgvector capability cache, log one degraded-mode warning, and execute JSON fallback. Other database errors must propagate.

- [ ] **Step 6: Update the facade and callers**

Replace the positional `searchSimilarChunks` signature with:

```ts
const retrieval = await searchDocumentChunks({
  embedding: queryEmbedding,
  query: question,
  limit: 16,
  scope: { canAccessHr: canAccessDocumentiHr(session) },
});
```

Use `retrieval.chunks`. In document chat, require `chunk.similarity >= 0.35` before the dynamic fused-score cutoff. Add `retrieval.mode` to the AI audit `_usage` object. Apply the same scope contract in both preventivo-generation routes.

- [ ] **Step 7: Verify**

Run:

```powershell
npx vitest run src/lib/__tests__/document-retrieval.test.ts src/lib/__tests__/core.test.ts
npm run typecheck
```

Expected: tests pass and all three retrieval callers compile.

- [ ] **Step 8: Commit**

```powershell
git add src/lib/document-retrieval.ts src/lib/__tests__/document-retrieval.test.ts src/lib/rag.ts src/app/api/documenti/chat/route.ts src/app/api/preventivi/genera/route.ts src/app/api/preventivi/[id]/genera/route.ts
git commit -m "feat: add hybrid vector document retrieval"
```

---

### Task 5: Retrieval quality benchmark

**Files:**
- Create: `src/lib/retrieval-metrics.ts`
- Create: `src/lib/__tests__/retrieval-metrics.test.ts`
- Create: `scripts/build-retrieval-gold.ts`
- Create: `scripts/evaluate-retrieval.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: historical `AiGenerationAudit` sources and document metadata.
- Produces: JSON gold set with at least 20 `{ query, expectedDocumentoIds }` cases.
- Produces: metrics report with Recall@5, MRR, rank-1, latency, and diversity.

- [ ] **Step 1: Write metric tests**

```ts
import { describe, expect, it } from "vitest";
import { calculateRetrievalMetrics } from "@/lib/retrieval-metrics";

describe("retrieval metrics", () => {
  it("calculates recall, reciprocal rank and rank-one rate", () => {
    const metrics = calculateRetrievalMetrics([
      { expected: ["a"], actual: ["a", "b"], latencyMs: 20 },
      { expected: ["c"], actual: ["b", "c"], latencyMs: 30 },
    ]);
    expect(metrics.recallAt5).toBe(1);
    expect(metrics.mrr).toBe(0.75);
    expect(metrics.rankOneRate).toBe(0.5);
    expect(metrics.averageLatencyMs).toBe(25);
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npx vitest run src/lib/__tests__/retrieval-metrics.test.ts`

Expected: FAIL because the metrics module does not exist.

- [ ] **Step 3: Implement metrics and gold builder**

`build-retrieval-gold.ts` must:

1. read historical `documenti_chat` audits with non-empty source document IDs;
2. deduplicate normalized questions;
3. generate additional Italian metadata queries from whitelisted documents with title, category, linked entity, and expiry date;
4. stop only after at least 20 cases;
5. write `logs/retrieval-gold.json`;
6. fail with a clear count when fewer than 20 eligible documents/audits exist.

Generated query forms are concrete:

```ts
[
  `Trova il documento ${document.titoloOriginale}`,
  document.entityLabel
    ? `Quali documenti riguardano ${document.entityLabel}?`
    : null,
  document.dataScadenza
    ? `Quale documento scade il ${formatItalianDate(document.dataScadenza)}?`
    : null,
].filter((query): query is string => Boolean(query));
```

`evaluate-retrieval.ts` embeds each query, runs the selected retrieval mode/profile, records top five distinct document IDs, and supports:

```text
--gold=logs/retrieval-gold.json
--label=baseline
--compare=logs/retrieval-baseline.json
```

Comparison exits with code 1 on Recall@5 or MRR regression and prints the relative Recall@5 change against the 10% target.

- [ ] **Step 4: Add scripts**

```json
"documenti:eval:gold": "tsx scripts/build-retrieval-gold.ts",
"documenti:eval": "tsx scripts/evaluate-retrieval.ts"
```

- [ ] **Step 5: Verify metrics**

Run:

```powershell
npx vitest run src/lib/__tests__/retrieval-metrics.test.ts
npm run typecheck
```

Expected: metric test passes and both scripts typecheck.

- [ ] **Step 6: Commit**

```powershell
git add package.json src/lib/retrieval-metrics.ts src/lib/__tests__/retrieval-metrics.test.ts scripts/build-retrieval-gold.ts scripts/evaluate-retrieval.ts
git commit -m "test: add document retrieval benchmark"
```

---

### Task 6: Persistent jobs, leases, worker, and automatic enqueue

**Files:**
- Create: `src/lib/document-ai-jobs.ts`
- Create: `src/lib/__tests__/document-ai-jobs.test.ts`
- Create: `scripts/document-ai-worker.ts`
- Modify: `src/lib/document-ai-queue.ts`
- Modify: `src/lib/document-ai-batch.ts`
- Modify: `src/app/api/documenti/route.ts:201-258`
- Modify: `scripts/import-documenti.ts:314-358`
- Modify: `package.json`
- Modify: `Dockerfile`
- Modify: `docker-compose.yml`

**Interfaces:**
- Consumes: `processDocumentoAi`, `indexDocumento`, active profile.
- Produces: enqueue, reconcile, claim, complete, fail, pause/resume functions.
- Produces: `npm run documenti:worker`.

- [ ] **Step 1: Write pure lease/retry tests**

```ts
import { describe, expect, it } from "vitest";
import {
  nextJobStateAfterFailure,
  shouldRequeueExpiredLease,
} from "@/lib/document-ai-jobs";

describe("document AI jobs", () => {
  it("retries with exponential delay up to three attempts", () => {
    const now = new Date("2026-08-10T12:00:00Z");
    const retry = nextJobStateAfterFailure({
      attempts: 0,
      maxAttempts: 3,
      terminal: false,
      now,
      error: "rate limit",
    });
    expect(retry.status).toBe("PENDING");
    expect(retry.attempts).toBe(1);
    expect(retry.nextRunAt.getTime()).toBe(now.getTime() + 2000);

    const failed = nextJobStateAfterFailure({
      attempts: 2,
      maxAttempts: 3,
      terminal: false,
      now,
      error: "still failing",
    });
    expect(failed.status).toBe("FAILED");
  });

  it("recovers an expired running lease", () => {
    expect(
      shouldRequeueExpiredLease({
        status: "RUNNING",
        leaseExpiresAt: new Date("2026-08-10T11:59:00Z"),
        now: new Date("2026-08-10T12:00:00Z"),
      })
    ).toBe(true);
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npx vitest run src/lib/__tests__/document-ai-jobs.test.ts`

Expected: FAIL because job helpers do not exist.

- [ ] **Step 3: Implement queue primitives**

Export these exact operations:

```ts
export async function enqueueDocumentAiJob(input: {
  documentoId: string;
  type: "FULL_PIPELINE" | "EMBEDDING_ONLY" | "FULL_REPROCESS";
  targetVersion?: string;
}): Promise<string>;

export async function reconcileDocumentAiJobs(limit?: number): Promise<number>;
export async function claimNextDocumentAiJob(workerId: string): Promise<DocumentoAiJob | null>;
export async function runClaimedDocumentAiJob(job: DocumentoAiJob): Promise<void>;
export async function pausePendingJobs(): Promise<number>;
export async function resumePausedJobs(): Promise<number>;
export async function retryFailedJobs(): Promise<number>;
export async function cleanupInactiveEmbeddingGenerations(
  retentionDays?: number
): Promise<number>;
```

Claim with one SQL statement using `FOR UPDATE SKIP LOCKED`, set a five-minute lease, and return the claimed row. Reconcile expired leases before claiming.

Execution mapping:

- `FULL_PIPELINE` → `processDocumentoAi` with OCR/structure/RAG enabled and no force.
- `EMBEDDING_ONLY` → `indexDocumento`.
- `FULL_REPROCESS` → `processDocumentoAi` with force enabled.

An OpenAI `insufficient_quota`, HTTP 401, or HTTP 403 error is terminal. Rate-limit and 5xx errors retry with 2s, 4s, then terminal failure. Completing a job clears lease/error and stores token count.

- [ ] **Step 4: Enqueue document creation atomically**

In both API upload and import paths, create the job through the document relation:

```ts
const initialEmbedding = {
  embeddingDesiredVersion: aiWhitelist
    ? DOCUMENT_EMBEDDING_PROFILE.version
    : null,
  aiJobs: {
    create: {
      type: "FULL_PIPELINE" as const,
      targetVersion: DOCUMENT_EMBEDDING_PROFILE.version,
    },
  },
};
```

For the API route, move document, optional deadline, and job creation into one `prisma.$transaction`. The importer uses the nested job create inside its retried document create. Duplicate document hashes must not create duplicate jobs.

- [ ] **Step 5: Implement reconciliation**

Reconciliation enqueues:

- `FULL_PIPELINE` for canonical documents still missing text or structured extraction;
- `EMBEDDING_ONLY` for canonical whitelisted documents whose `embeddingActiveProfile` differs from `DOCUMENT_EMBEDDING_PROFILE.version`;
- no automatic retry for documents/jobs already terminally failed.

Use upsert on `[documentoId, type, targetVersion]` and never reset a `RUNNING` job.

`cleanupInactiveEmbeddingGenerations` deletes chunk and centroid generations older
than the retention threshold only when their generation ID differs from the
document's `embeddingActiveVersion`. It runs at most once per worker hour and
uses `DOCUMENT_EMBEDDING_RETENTION_DAYS`, default 14. Existing `document-v1`
generations are retained while `DOCUMENT_EMBEDDING_CLEANUP_ENABLED=false`; set
the flag to true only after the v2 quality gate passes. The cleanup query also
requires `embeddingActiveProfile = 'document-v2'`.

- [ ] **Step 6: Implement the continuous worker**

`document-ai-worker.ts`:

```ts
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { prisma } from "../src/lib/db";
import {
  DOCUMENT_AI_WORKER_POLL_MS,
  DOCUMENT_EMBEDDING_CLEANUP_ENABLED,
} from "../src/lib/config";
import {
  claimNextDocumentAiJob,
  cleanupInactiveEmbeddingGenerations,
  reconcileDocumentAiJobs,
  runClaimedDocumentAiJob,
} from "../src/lib/document-ai-jobs";

const workerId = `worker-${randomUUID()}`;
let stopping = false;
let lastCleanupAt = 0;
process.on("SIGINT", () => { stopping = true; });
process.on("SIGTERM", () => { stopping = true; });

while (!stopping) {
  await reconcileDocumentAiJobs(100);
  if (
    DOCUMENT_EMBEDDING_CLEANUP_ENABLED &&
    Date.now() - lastCleanupAt >= 60 * 60 * 1000
  ) {
    await cleanupInactiveEmbeddingGenerations();
    lastCleanupAt = Date.now();
  }
  const job = await claimNextDocumentAiJob(workerId);
  if (!job) {
    await delay(DOCUMENT_AI_WORKER_POLL_MS);
    continue;
  }
  await runClaimedDocumentAiJob(job);
}

await prisma.$disconnect();
```

- [ ] **Step 7: Package worker for local and Docker execution**

Add:

```json
"documenti:worker": "tsx scripts/document-ai-worker.ts"
```

Add a `worker` Dockerfile target that copies `node_modules`, `package.json`, `tsconfig.json`, `prisma`, `scripts`, and `src`, then runs schema sync and the worker. Add a `worker` compose service with the same database/OpenAI/R2/document source environment as `app`, database health dependency, and `restart: unless-stopped`.

- [ ] **Step 8: Verify**

Run:

```powershell
npx vitest run src/lib/__tests__/document-ai-jobs.test.ts src/lib/__tests__/core.test.ts
npm run typecheck
docker compose config
```

Expected: tests/typecheck pass and compose resolves both `app` and `worker`.

- [ ] **Step 9: Commit**

```powershell
git add src/lib/document-ai-jobs.ts src/lib/__tests__/document-ai-jobs.test.ts scripts/document-ai-worker.ts src/lib/document-ai-queue.ts src/lib/document-ai-batch.ts src/app/api/documenti/route.ts scripts/import-documenti.ts package.json package-lock.json Dockerfile docker-compose.yml
git commit -m "feat: process document AI jobs reliably"
```

---

### Task 7: Durable admin queue controls and statistics

**Files:**
- Create: `src/lib/document-ai-admin.ts`
- Create: `src/lib/__tests__/document-ai-admin.test.ts`
- Modify: `src/app/api/admin/documenti-ai/route.ts`
- Create: `src/components/documenti-ai/processing-panel.tsx`
- Modify: `src/app/(app)/admin/documenti-ai/page.tsx`

**Interfaces:**
- Consumes: persistent job functions and pgvector capability.
- Produces GET stats/recent jobs and POST queue actions.

- [ ] **Step 1: Write action validation tests**

```ts
import { describe, expect, it } from "vitest";
import { documentAiAdminActionSchema } from "@/lib/document-ai-admin";

describe("document AI admin actions", () => {
  it("requires confirmation for full reprocessing", () => {
    expect(
      documentAiAdminActionSchema.safeParse({
        action: "full_reprocess",
        confirmed: false,
      }).success
    ).toBe(false);
    expect(
      documentAiAdminActionSchema.safeParse({
        action: "reindex_all",
      }).success
    ).toBe(true);
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npx vitest run src/lib/__tests__/document-ai-admin.test.ts`

Expected: FAIL because the admin module does not exist.

- [ ] **Step 3: Implement admin service and API contract**

GET returns:

```ts
type DocumentAiAdminSnapshot = {
  documents: {
    total: number;
    pendingProfile: number;
    indexedV2: number;
    failed: number;
  };
  jobs: Record<"PENDING" | "RUNNING" | "PAUSED" | "COMPLETED" | "FAILED", number>;
  recentJobs: Array<{
    id: string;
    documentoId: string;
    titolo: string;
    type: string;
    status: string;
    attempts: number;
    tokenCount: number;
    lastError: string | null;
    updatedAt: string;
  }>;
  profile: string;
  vectorMode: "pgvector" | "json";
  vectorReason: string | null;
  openaiConfigured: boolean;
  r2Configured: boolean;
};
```

POST accepts:

```ts
const documentAiAdminActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("enqueue_pending") }),
  z.object({ action: z.literal("reindex_all") }),
  z.object({ action: z.literal("pause") }),
  z.object({ action: z.literal("resume") }),
  z.object({ action: z.literal("retry_failed") }),
  z.object({
    action: z.literal("full_reprocess"),
    confirmed: z.literal(true),
  }),
]);
```

Keep the existing session and `ADMIN` checks in both handlers. `reindex_all` upserts `EMBEDDING_ONLY` jobs only for canonical whitelisted documents. `full_reprocess` upserts `FULL_REPROCESS`.

- [ ] **Step 4: Replace browser-held batch loops with durable controls**

Move processing UI into `processing-panel.tsx`. It polls GET every three seconds while PENDING/RUNNING jobs exist and every fifteen seconds otherwise. Buttons call POST actions and render:

- active profile/vector mode;
- pending/running/completed/failed counts;
- indexed-v2 and stale documents;
- token total and retry count;
- recent durable jobs with errors;
- “Pausa dopo job corrente”, “Riprendi”, and “Riprova falliti”.

The normal primary action is “Metti in coda documenti mancanti”. “Reindicizza tutti in v2” shows an embedding-only explanation. “Rielabora OCR + struttura + embedding” requires a dialog where the user confirms the cost warning.

- [ ] **Step 5: Make the page a tab shell**

Use the existing `Tabs` component with `processing` and a temporarily disabled
`map` tab that Task 9 will complete. Preserve the corrected
configuration-warning behavior: warnings render only after a successful
non-null snapshot.

- [ ] **Step 6: Verify**

Run:

```powershell
npx vitest run src/lib/__tests__/document-ai-admin.test.ts src/lib/__tests__/core.test.ts
npm run typecheck
```

Expected: tests pass and admin UI/API compile.

- [ ] **Step 7: Commit**

```powershell
git add src/lib/document-ai-admin.ts src/lib/__tests__/document-ai-admin.test.ts src/app/api/admin/documenti-ai/route.ts src/components/documenti-ai/processing-panel.tsx src/app/(app)/admin/documenti-ai/page.tsx
git commit -m "feat: add durable document AI controls"
```

---

### Task 8: Document similarity edges and bounded graph API

**Files:**
- Create: `src/lib/document-similarity.ts`
- Create: `src/lib/__tests__/document-similarity.test.ts`
- Create: `src/app/api/admin/documenti-ai/map/route.ts`
- Modify: `src/lib/document-indexer.ts`
- Modify: `src/lib/document-ai-jobs.ts`

**Interfaces:**
- Consumes: active centroids and `DOCUMENT_SIMILARITY_MIN`.
- Produces: `refreshDocumentSimilarities(documentoId)` and `getDocumentSimilarityGraph(filters)`.

- [ ] **Step 1: Write graph sanitization tests**

```ts
import { describe, expect, it } from "vitest";
import { buildGraphPayload } from "@/lib/document-similarity";

describe("document similarity graph", () => {
  it("drops stale edges and never exposes vectors or chunk text", () => {
    const graph = buildGraphPayload({
      documents: [
        {
          id: "a",
          title: "A.pdf",
          category: "TECNICO",
          activeVersion: "a-v2",
          chunkCount: 3,
          status: "READY",
          documentDate: null,
          expiryDate: null,
        },
        {
          id: "b",
          title: "B.pdf",
          category: "TECNICO",
          activeVersion: "b-v2",
          chunkCount: 2,
          status: "READY",
          documentDate: null,
          expiryDate: null,
        },
      ],
      edges: [
        {
          sourceDocumentoId: "a",
          targetDocumentoId: "b",
          sourceVersion: "a-v1",
          targetVersion: "b-v2",
          score: 0.8,
        },
      ],
    });
    expect(graph.links).toHaveLength(0);
    expect(JSON.stringify(graph)).not.toContain("embedding");
    expect(JSON.stringify(graph)).not.toContain("content");
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npx vitest run src/lib/__tests__/document-similarity.test.ts`

Expected: FAIL because the similarity module does not exist.

- [ ] **Step 3: Implement nearest-neighbor edge refresh**

Export:

```ts
export async function refreshDocumentSimilarities(
  documentoId: string
): Promise<number>;

export async function getDocumentSimilarityGraph(filters: {
  search?: string;
  categories?: string[];
  status?: string;
  dateFrom?: Date;
  dateTo?: Date;
  minSimilarity?: number;
  limit?: number;
}): Promise<DocumentSimilarityGraph>;
```

Native mode selects the five nearest active centroids with cosine score at least `DOCUMENT_SIMILARITY_MIN`. JSON mode computes against at most 1,000 most recently indexed active centroids and reports degraded mode. Before inserting new source edges, delete existing source edges; store source and target active generation IDs. Do not create self-links.

Call `refreshDocumentSimilarities` only after a successful document activation. Job reconciliation also finds active centroid rows with no current-version source edges and refreshes them in bounded batches.

- [ ] **Step 4: Implement graph query and payload**

Query at most `Math.min(requestedLimit, 1000)` canonical, whitelisted, active documents. Fetch only metadata, active centroid chunk count, and stored edges. `buildGraphPayload` discards:

- targets outside the selected node set;
- stale source/target versions;
- edges below requested threshold;
- duplicate reverse links, keeping the higher score.

Return:

```ts
type DocumentSimilarityGraph = {
  nodes: Array<{
    id: string;
    title: string;
    category: string;
    chunkCount: number;
    status: string;
    documentDate: string | null;
    expiryDate: string | null;
  }>;
  links: Array<{ source: string; target: string; score: number }>;
  truncated: boolean;
  vectorMode: "pgvector" | "json";
};
```

- [ ] **Step 5: Add the admin map endpoint**

GET parses:

```text
search, categories (comma-separated), status, dateFrom, dateTo,
minSimilarity (0..1), limit (1..1000)
```

Use Zod, existing auth, and explicit admin check. Invalid filters return 400. Non-admin users return 403. The response must not include `centroid`, `embedding`, `embeddingVector`, or chunk `content`.

- [ ] **Step 6: Verify**

Run:

```powershell
npx vitest run src/lib/__tests__/document-similarity.test.ts
npm run typecheck
```

Expected: graph tests and typecheck pass.

- [ ] **Step 7: Commit**

```powershell
git add src/lib/document-similarity.ts src/lib/__tests__/document-similarity.test.ts src/app/api/admin/documenti-ai/map/route.ts src/lib/document-indexer.ts src/lib/document-ai-jobs.ts
git commit -m "feat: expose document similarity graph"
```

---

### Task 9: Interactive admin 3D map

**Files:**
- Create: `src/components/documenti-ai/document-map-3d.tsx`
- Create: `src/components/documenti-ai/document-map-panel.tsx`
- Create: `src/lib/__tests__/document-map-ui.test.ts`
- Modify: `src/app/(app)/admin/documenti-ai/page.tsx`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Consumes: `GET /api/admin/documenti-ai/map`.
- Produces: client-only 3D graph with filters, focus, reset, and document navigation.

- [ ] **Step 1: Install renderer dependencies**

Run:

```powershell
npm install react-force-graph-3d three
npm install --save-dev @types/three
```

Expected: package and lock files include the latest compatible releases.

- [ ] **Step 2: Write static UI regression test**

```ts
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import DocumentiAiAdminPage from "@/app/(app)/admin/documenti-ai/page";

describe("document AI map tab", () => {
  it("renders processing and 3D map navigation without loading WebGL on the server", () => {
    const html = renderToStaticMarkup(createElement(DocumentiAiAdminPage));
    expect(html).toContain("Elaborazione");
    expect(html).toContain("Mappa 3D");
    expect(html).not.toContain("WebGLRenderingContext");
  });
});
```

- [ ] **Step 3: Run and confirm missing map tab**

Run: `npx vitest run src/lib/__tests__/document-map-ui.test.ts`

Expected: FAIL because the completed “Mappa 3D” tab is absent.

- [ ] **Step 4: Implement the client-only renderer**

`document-map-3d.tsx` begins with `"use client"` and exports a default component receiving the graph payload. Use `ForceGraph3D` with:

```tsx
<ForceGraph3D
  graphData={graph}
  nodeLabel={(node) =>
    `${node.title}<br/>${node.category}<br/>${neighborSummary(node.id, graph.links)}`
  }
  nodeVal={(node) => Math.max(2, Math.sqrt(node.chunkCount) * 2)}
  nodeColor={(node) => categoryColor(node.category, node.status)}
  nodeThreeObject={(node) => documentNodeMesh(node)}
  linkWidth={(link) => 0.5 + link.score * 2}
  linkOpacity={0.35}
  onNodeClick={(node) => {
    focusCamera(node);
    onOpenDocument(node.id);
  }}
/>
```

Use stable category colors derived from a string hash. `documentNodeMesh` creates
a `THREE.Mesh` sphere with `MeshStandardMaterial`; failed/review nodes set red or
amber `emissive` and `emissiveIntensity`, while ready nodes use the category
color. `neighborSummary` reports link count and average similarity. Expose a
reset-camera callback through props rather than importing router into the
renderer.

- [ ] **Step 5: Implement filters and dynamic loading**

`document-map-panel.tsx` uses:

```ts
const DocumentMap3D = dynamic(
  () => import("@/components/documenti-ai/document-map-3d"),
  { ssr: false, loading: () => <MapSkeleton /> }
);
```

Provide search, multi-category selection, status, date range, minimum-similarity slider, node limit, refresh, and camera reset. Debounce fetch by 300ms and abort stale requests. Clicking a node navigates to `/documenti/${id}`. Show a visible “primi 1.000 nodi” notice when `truncated` is true and a degraded JSON badge when `vectorMode === "json"`.

- [ ] **Step 6: Complete the page tabs**

Replace the Task 7 temporary map panel with `DocumentMapPanel`. Do not mount the
map panel until its tab is active. Keep page width responsive and use a graph
height of `min(72vh, 760px)`.

- [ ] **Step 7: Verify**

Run:

```powershell
npx vitest run src/lib/__tests__/document-map-ui.test.ts src/lib/__tests__/core.test.ts
npm run typecheck
npm run lint
```

Expected: tests, typecheck, and lint pass.

- [ ] **Step 8: Commit**

```powershell
git add package.json package-lock.json src/components/documenti-ai/document-map-3d.tsx src/components/documenti-ai/document-map-panel.tsx src/lib/__tests__/document-map-ui.test.ts src/app/(app)/admin/documenti-ai/page.tsx
git commit -m "feat: add 3d document similarity map"
```

---

### Task 10: Database integration checks, rollout, and documentation

**Files:**
- Create: `src/lib/__tests__/document-ai-api-security.test.ts`
- Create: `scripts/verify-document-vector-db.ts`
- Modify: `README.md`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: completed schema, indexer, retrieval, worker, graph.
- Produces: repeatable database verification and deployment runbook.

- [ ] **Step 1: Add API authorization regressions**

Mock `@/lib/auth`, `@/lib/document-ai-admin`, and
`@/lib/document-similarity`, then dynamically import the two route modules:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const { auth } = vi.hoisted(() => ({ auth: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth }));
vi.mock("@/lib/document-ai-admin", () => ({
  getDocumentAiAdminSnapshot: vi.fn(),
  executeDocumentAiAdminAction: vi.fn(),
  documentAiAdminActionSchema: { safeParse: vi.fn() },
}));
vi.mock("@/lib/document-similarity", () => ({
  getDocumentSimilarityGraph: vi.fn(),
}));

describe("document AI admin API security", () => {
  beforeEach(() => {
    vi.resetModules();
    auth.mockReset();
  });

  it("rejects anonymous queue and map requests", async () => {
    auth.mockResolvedValue(null);
    const adminRoute = await import("@/app/api/admin/documenti-ai/route");
    const mapRoute = await import("@/app/api/admin/documenti-ai/map/route");
    expect((await adminRoute.GET()).status).toBe(401);
    expect(
      (await mapRoute.GET(new Request("http://localhost/api/admin/documenti-ai/map"))).status
    ).toBe(401);
  });

  it("rejects non-admin queue and map requests", async () => {
    auth.mockResolvedValue({ user: { id: "u1", role: "OPERATORE" } });
    const adminRoute = await import("@/app/api/admin/documenti-ai/route");
    const mapRoute = await import("@/app/api/admin/documenti-ai/map/route");
    expect((await adminRoute.GET()).status).toBe(403);
    expect(
      (await mapRoute.GET(new Request("http://localhost/api/admin/documenti-ai/map"))).status
    ).toBe(403);
  });
});
```

Run: `npx vitest run src/lib/__tests__/document-ai-api-security.test.ts`

Expected: both anonymous and non-admin cases pass for queue and map routes.

- [ ] **Step 2: Add a safe database verification script**

The script requires `TEST_DATABASE_URL`, refuses hosts not equal to `localhost`, `127.0.0.1`, or `db`, and verifies:

1. pgvector capability detection;
2. insertion of two 1,536-dimensional vectors;
3. HNSW cosine query order;
4. staging activation preserves old active version on forced failure;
5. native and JSON fallback return the same expected top document on a fixed
   fixture;
6. two concurrent claims return different jobs;
7. stale similarity edges are absent from graph payload.

It must wrap fixture writes in a transaction and roll back in `finally`.

- [ ] **Step 3: Add CI commands**

CI runs:

```yaml
- run: npx prisma validate
- run: npm run typecheck
- run: npm test
- run: npm run lint
- run: npm run build
```

Database verification runs only in a job with a Postgres `pgvector/pgvector:pg16` service and `TEST_DATABASE_URL` pointing to that service.

- [ ] **Step 4: Document operations**

README must include:

```powershell
npm run db:sync
npm run documenti:worker
npm run documenti:eval:gold
npm run documenti:eval -- --gold=logs/retrieval-gold.json --label=baseline
```

Document:

- pgvector and JSON degraded-mode indicators;
- embedding-only versus full reprocess;
- worker deployment and local startup;
- retry/pause behavior;
- gold-set minimum and quality gate;
- `DOCUMENT_EMBEDDING_CLEANUP_ENABLED=true` only after the observation period.

- [ ] **Step 5: Run complete verification**

Run:

```powershell
npx prisma validate
npm run typecheck
npm test
npm run lint
npm run build
docker compose config
```

Expected: every command exits 0. If `TEST_DATABASE_URL` is available, also run:

```powershell
npx tsx scripts/verify-document-vector-db.ts
```

Expected: seven database checks pass and fixture writes are rolled back.

- [ ] **Step 6: Run quality gate before mass activation**

On a representative non-production copy:

```powershell
npm run documenti:eval:gold
npm run documenti:eval -- --gold=logs/retrieval-gold.json --label=baseline
npm run documenti:worker
npm run documenti:eval -- --gold=logs/retrieval-gold.json --label=v2 --compare=logs/retrieval-baseline.json
```

Expected: no Recall@5/MRR regression. Record whether the 10% relative Recall@5 target is reached before queuing all existing documents. Keep `DOCUMENT_EMBEDDING_CLEANUP_ENABLED=false` throughout comparison and observation.

- [ ] **Step 7: Commit**

```powershell
git add src/lib/__tests__/document-ai-api-security.test.ts scripts/verify-document-vector-db.ts README.md .github/workflows/ci.yml
git commit -m "docs: add embedding v2 rollout checks"
```

---

## Execution Order and Review Gates

1. Tasks 1–2 establish schema and pure algorithms.
2. Tasks 3–4 create a working v2 index and retrieval path.
3. Task 5 provides the quality gate before broad re-indexing.
4. Tasks 6–7 make processing automatic and observable.
5. Tasks 8–9 add similarity edges and the 3D map.
6. Task 10 validates deployment and rollout.

After each task, review only that task's listed files and run its focused commands. Before mass re-indexing, retain `document-v1` generations and complete the Task 5 comparison. Old generations are cleanup candidates only after successful full verification and an observation period.
