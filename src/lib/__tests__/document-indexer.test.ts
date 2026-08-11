import { describe, expect, it, vi } from "vitest";
import { createDocumentIndexer } from "@/lib/document-indexer";

const document = {
  id: "doc-1",
  aiWhitelist: true,
  title: "Manuale.pdf",
  category: "TECNICO",
  subcategory: null,
  entityLabel: null,
  documentDate: null,
  expiryDate: null,
  pages: [{ pageNumber: 1, content: "Manutenzione estintori." }],
};

describe("document indexer", () => {
  it("attiva solo dopo la validazione di tutti i vettori", async () => {
    const persistAndActivate = vi.fn().mockResolvedValue("pgvector");
    const indexer = createDocumentIndexer({
      loadDocument: vi.fn().mockResolvedValue(document),
      embed: vi.fn().mockResolvedValue({
        embeddings: [Array(1536).fill(0.01)],
        tokens: 12,
      }),
      persistAndActivate,
      markIndexing: vi.fn(),
      markFailed: vi.fn(),
    });

    const result = await indexer.index("doc-1");

    expect(result.chunkCount).toBe(1);
    expect(result.vectorMode).toBe("pgvector");
    expect(persistAndActivate).toHaveBeenCalledOnce();
  });

  it("non attiva una generazione con dimensioni errate", async () => {
    const persistAndActivate = vi.fn();
    const markFailed = vi.fn();
    const indexer = createDocumentIndexer({
      loadDocument: vi.fn().mockResolvedValue(document),
      embed: vi.fn().mockResolvedValue({
        embeddings: [[1, 2]],
        tokens: 2,
      }),
      persistAndActivate,
      markIndexing: vi.fn(),
      markFailed,
    });

    await expect(indexer.index("doc-1")).rejects.toThrow("dimension");
    expect(persistAndActivate).not.toHaveBeenCalled();
    expect(markFailed).toHaveBeenCalledOnce();
  });
});
