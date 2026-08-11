import { describe, expect, it } from "vitest";
import {
  filterAuthorizedCandidates,
  normalizeFusedResults,
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
});
