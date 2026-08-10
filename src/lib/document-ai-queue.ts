import type { Prisma } from "@prisma/client";

/** Nuovi/PENDING o step AI incompleti; errori terminali richiedono retry force. */
export function pendingAiWhere(): Prisma.DocumentoWhereInput {
  return {
    canonicalDocumentoId: null,
    NOT: {
      statoIngestione: { in: ["FAILED", "DA_REVISIONARE"] },
    },
    OR: [
      { statoIngestione: "PENDING" },
      { extractedText: null },
      { extractedText: "" },
      { extractionAt: null },
      {
        AND: [
          { aiWhitelist: true },
          { extractedText: { not: null } },
          { chunks: { none: {} } },
        ],
      },
    ],
  };
}
