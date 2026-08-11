import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { OPENAI_EMBEDDING_DIMENSIONS } from "@/lib/config";

export type PgvectorCapability = {
  available: boolean;
  reason: string | null;
};

let cached:
  | { value: PgvectorCapability; expiresAt: number }
  | undefined;

export function invalidatePgvectorCapability(): void {
  cached = undefined;
}

export function vectorLiteral(
  vector: number[],
  dimensions = OPENAI_EMBEDDING_DIMENSIONS
): string {
  if (vector.length !== dimensions) {
    throw new Error(
      `dimensione embedding non valida: ${vector.length}, attesa ${dimensions}`
    );
  }
  if (vector.some((value) => !Number.isFinite(value))) {
    throw new Error("embedding contiene valori non finiti");
  }
  return `[${vector.join(",")}]`;
}

export async function getPgvectorCapability(): Promise<PgvectorCapability> {
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  try {
    const rows = await prisma.$queryRaw<
      Array<{ extension: boolean; columns: bigint }>
    >`
      SELECT
        EXISTS (
          SELECT 1 FROM pg_extension WHERE extname = 'vector'
        ) AS extension,
        COUNT(*)::bigint AS columns
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND (
          (table_name = 'DocumentoChunk' AND column_name = 'embeddingVector')
          OR
          (table_name = 'DocumentoEmbedding' AND column_name = 'centroidVector')
        )
    `;
    const row = rows[0];
    const available = Boolean(row?.extension) && Number(row?.columns ?? 0) === 2;
    const value = {
      available,
      reason: available
        ? null
        : "Estensione vector o colonne native non disponibili",
    };
    cached = {
      value,
      expiresAt: Date.now() + (available ? 60_000 : 10_000),
    };
    return value;
  } catch (error) {
    const value = {
      available: false,
      reason: error instanceof Error ? error.message : String(error),
    };
    cached = { value, expiresAt: Date.now() + 10_000 };
    return value;
  }
}

export async function writeChunkVector(
  tx: Prisma.TransactionClient,
  chunkId: string,
  vector: number[]
): Promise<void> {
  const literal = vectorLiteral(vector);
  await tx.$executeRaw`
    UPDATE "DocumentoChunk"
    SET "embeddingVector" = ${literal}::vector
    WHERE id = ${chunkId}
  `;
}

export async function writeCentroidVector(
  tx: Prisma.TransactionClient,
  embeddingId: string,
  vector: number[]
): Promise<void> {
  const literal = vectorLiteral(vector);
  await tx.$executeRaw`
    UPDATE "DocumentoEmbedding"
    SET "centroidVector" = ${literal}::vector
    WHERE id = ${embeddingId}
  `;
}

export function isPgvectorUnavailableError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /embeddingVector|centroidVector|type "vector"|operator does not exist|42703|42704|42883/i.test(
    message
  );
}
