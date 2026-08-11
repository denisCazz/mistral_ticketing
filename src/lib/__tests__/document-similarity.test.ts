import { describe, expect, it } from "vitest";
import { buildGraphPayload } from "@/lib/document-similarity";

describe("document similarity graph", () => {
  it("scarta archi obsoleti e non espone vettori o testo", () => {
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

  it("deduplica archi inversi mantenendo lo score maggiore", () => {
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
          sourceVersion: "a-v2",
          targetVersion: "b-v2",
          score: 0.75,
        },
        {
          sourceDocumentoId: "b",
          targetDocumentoId: "a",
          sourceVersion: "b-v2",
          targetVersion: "a-v2",
          score: 0.82,
        },
      ],
    });

    expect(graph.links).toEqual([
      { source: "b", target: "a", score: 0.82 },
    ]);
  });
});
