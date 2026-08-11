import { describe, expect, it } from "vitest";
import { buildDocumentChunks } from "@/lib/document-chunker";

describe("buildDocumentChunks", () => {
  it("mantiene le pagine e usa i metadati solo per embedding", () => {
    const chunks = buildDocumentChunks({
      pages: [
        {
          pageNumber: 1,
          content: "SICUREZZA\n\nCorso antincendio completato.",
        },
        {
          pageNumber: 2,
          content: "Scadenza attestato: 10/08/2028.",
        },
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
    expect(chunks[0].embeddingInput).toContain(
      "Documento: Attestato Rossi.pdf"
    );
    expect(chunks.some((chunk) => chunk.pageTo === 2)).toBe(true);
    expect(chunks.every((chunk) => chunk.tokenCount <= 1200)).toBe(true);
  });

  it("produce hash stabili e overlap su testo lungo", () => {
    const paragraph =
      "Manutenzione periodica impianto antincendio. ".repeat(600);
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
    const overlappedStart = first[1].content
      .split(/\s+/)
      .slice(0, 8)
      .join(" ");
    expect(first[0].content.replace(/\s+/g, " ")).toContain(overlappedStart);
  });
});
