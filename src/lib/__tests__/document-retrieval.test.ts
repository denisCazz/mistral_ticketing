import { describe, expect, it } from "vitest";
import {
  filterAuthorizedCandidates,
  normalizeFusedResults,
  prismaDocumentSearchFilters,
} from "@/lib/document-retrieval";

describe("document retrieval", () => {
  it("esclude documenti HR dallo scope non amministratore", () => {
    const rows = [
      { id: "a", entityType: "AZIENDA", categoria: "TECNICO" },
      { id: "b", entityType: "DIPENDENTE", categoria: "FORMAZIONE" },
      { id: "c", entityType: "AZIENDA", categoria: "DURC" },
    ];

    expect(
      filterAuthorizedCandidates(rows, { canAccessHr: false }).map(
        (row) => row.id
      )
    ).toEqual(["a"]);
  });

  it("normalizza RRF conservando la similarità coseno", () => {
    const rows = normalizeFusedResults([
      { id: "a", fusedScore: 0.03, similarity: 0.82 },
      { id: "b", fusedScore: 0.02, similarity: 0.74 },
    ]);

    expect(rows[0].relevance).toBe(1);
    expect(rows[1].relevance).toBeCloseTo(2 / 3);
    expect(rows[0].similarity).toBe(0.82);
  });

  it("costruisce filtri prisma per targa e categoria", () => {
    expect(
      prismaDocumentSearchFilters({
        automezzoId: "auto-1",
        categorie: ["ASSICURAZIONI"],
      })
    ).toEqual({
      automezzoId: "auto-1",
      categoria: { in: ["ASSICURAZIONI"] },
    });
    expect(
      prismaDocumentSearchFilters({
        dipendenteId: "d1",
        automezzoId: "a1",
      })
    ).toEqual({
      OR: [{ dipendenteId: "d1" }, { automezzoId: "a1" }],
    });
  });
});
