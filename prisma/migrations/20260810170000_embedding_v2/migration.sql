-- Embedding v2: profili/versioni, coda persistente e grafo documenti.
DO $$ BEGIN
  CREATE TYPE "EmbeddingStatus" AS ENUM ('PENDING', 'INDEXING', 'READY', 'FAILED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "DocumentoAiJobType" AS ENUM ('FULL_PIPELINE', 'EMBEDDING_ONLY', 'FULL_REPROCESS');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "DocumentoAiJobStatus" AS ENUM ('PENDING', 'RUNNING', 'PAUSED', 'COMPLETED', 'FAILED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "Documento"
  ADD COLUMN IF NOT EXISTS "embeddingDesiredVersion" TEXT,
  ADD COLUMN IF NOT EXISTS "embeddingActiveProfile" TEXT,
  ADD COLUMN IF NOT EXISTS "embeddingActiveVersion" TEXT,
  ADD COLUMN IF NOT EXISTS "embeddingStatus" "EmbeddingStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS "embeddingIndexedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "embeddingLastError" TEXT;

ALTER TABLE "DocumentoChunk"
  ADD COLUMN IF NOT EXISTS "embeddingProfile" TEXT NOT NULL DEFAULT 'document-v1',
  ADD COLUMN IF NOT EXISTS "embeddingVersion" TEXT NOT NULL DEFAULT 'document-v1',
  ADD COLUMN IF NOT EXISTS "chunkIndex" INTEGER,
  ADD COLUMN IF NOT EXISTS "contentHash" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "tokenCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "pageFrom" INTEGER,
  ADD COLUMN IF NOT EXISTS "pageTo" INTEGER,
  ADD COLUMN IF NOT EXISTS "sectionTitle" TEXT;

WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY "documentoId"
           ORDER BY "createdAt", id
         ) - 1 AS position
  FROM "DocumentoChunk"
)
UPDATE "DocumentoChunk" AS chunk
SET "chunkIndex" = ranked.position,
    "contentHash" = md5(chunk.content),
    "tokenCount" = CEIL(length(chunk.content) / 4.0)::INTEGER
FROM ranked
WHERE ranked.id = chunk.id
  AND chunk."chunkIndex" IS NULL;

ALTER TABLE "DocumentoChunk"
  ALTER COLUMN "chunkIndex" SET DEFAULT 0,
  ALTER COLUMN "chunkIndex" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "DocumentoChunk_documentoId_embeddingVersion_chunkIndex_key"
  ON "DocumentoChunk"("documentoId", "embeddingVersion", "chunkIndex");
CREATE INDEX IF NOT EXISTS "DocumentoChunk_embeddingProfile_idx"
  ON "DocumentoChunk"("embeddingProfile");
CREATE INDEX IF NOT EXISTS "DocumentoChunk_embeddingVersion_idx"
  ON "DocumentoChunk"("embeddingVersion");
DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS "DocumentoChunk_fts_it_idx"
    ON "DocumentoChunk" USING GIN (to_tsvector('italian', content));
EXCEPTION
  WHEN undefined_object THEN
    -- fallback se la configurazione 'italian' non è installata sul DB
    CREATE INDEX IF NOT EXISTS "DocumentoChunk_fts_it_idx"
      ON "DocumentoChunk" USING GIN (to_tsvector('simple', content));
  WHEN duplicate_table THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "DocumentoEmbedding" (
  "id" TEXT NOT NULL,
  "documentoId" TEXT NOT NULL,
  "embeddingProfile" TEXT NOT NULL,
  "embeddingVersion" TEXT NOT NULL,
  "centroid" JSONB NOT NULL,
  "model" TEXT NOT NULL,
  "dimensions" INTEGER NOT NULL,
  "chunkCount" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DocumentoEmbedding_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "DocumentoSimilarity" (
  "id" TEXT NOT NULL,
  "sourceDocumentoId" TEXT NOT NULL,
  "targetDocumentoId" TEXT NOT NULL,
  "sourceVersion" TEXT NOT NULL,
  "targetVersion" TEXT NOT NULL,
  "score" DOUBLE PRECISION NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DocumentoSimilarity_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "DocumentoAiJob" (
  "id" TEXT NOT NULL,
  "documentoId" TEXT NOT NULL,
  "type" "DocumentoAiJobType" NOT NULL,
  "targetVersion" TEXT NOT NULL,
  "status" "DocumentoAiJobStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 3,
  "nextRunAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leaseOwner" TEXT,
  "leaseExpiresAt" TIMESTAMP(3),
  "lastError" TEXT,
  "tokenCount" INTEGER NOT NULL DEFAULT 0,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DocumentoAiJob_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "DocumentoEmbedding_documentoId_embeddingVersion_key"
  ON "DocumentoEmbedding"("documentoId", "embeddingVersion");
CREATE INDEX IF NOT EXISTS "DocumentoEmbedding_embeddingProfile_idx"
  ON "DocumentoEmbedding"("embeddingProfile");
CREATE UNIQUE INDEX IF NOT EXISTS "DocumentoSimilarity_sourceDocumentoId_targetDocumentoId_key"
  ON "DocumentoSimilarity"("sourceDocumentoId", "targetDocumentoId");
CREATE INDEX IF NOT EXISTS "DocumentoSimilarity_sourceDocumentoId_score_idx"
  ON "DocumentoSimilarity"("sourceDocumentoId", "score");
CREATE INDEX IF NOT EXISTS "DocumentoSimilarity_targetDocumentoId_idx"
  ON "DocumentoSimilarity"("targetDocumentoId");
CREATE UNIQUE INDEX IF NOT EXISTS "DocumentoAiJob_documentoId_type_targetVersion_key"
  ON "DocumentoAiJob"("documentoId", "type", "targetVersion");
CREATE INDEX IF NOT EXISTS "DocumentoAiJob_status_nextRunAt_idx"
  ON "DocumentoAiJob"("status", "nextRunAt");
CREATE INDEX IF NOT EXISTS "DocumentoAiJob_leaseExpiresAt_idx"
  ON "DocumentoAiJob"("leaseExpiresAt");

DO $$ BEGIN
  ALTER TABLE "DocumentoEmbedding"
    ADD CONSTRAINT "DocumentoEmbedding_documentoId_fkey"
    FOREIGN KEY ("documentoId") REFERENCES "Documento"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "DocumentoSimilarity"
    ADD CONSTRAINT "DocumentoSimilarity_sourceDocumentoId_fkey"
    FOREIGN KEY ("sourceDocumentoId") REFERENCES "Documento"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "DocumentoSimilarity"
    ADD CONSTRAINT "DocumentoSimilarity_targetDocumentoId_fkey"
    FOREIGN KEY ("targetDocumentoId") REFERENCES "Documento"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "DocumentoAiJob"
    ADD CONSTRAINT "DocumentoAiJob_documentoId_fkey"
    FOREIGN KEY ("documentoId") REFERENCES "Documento"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

UPDATE "Documento" AS document
SET "embeddingActiveProfile" = 'document-v1',
    "embeddingActiveVersion" = 'document-v1',
    "embeddingStatus" = 'READY'
WHERE document."embeddingActiveVersion" IS NULL
  AND EXISTS (
    SELECT 1
    FROM "DocumentoChunk" AS chunk
    WHERE chunk."documentoId" = document.id
  );

UPDATE "Documento"
SET "embeddingDesiredVersion" = 'document-v2'
WHERE "aiWhitelist" = true
  AND "embeddingDesiredVersion" IS NULL;
