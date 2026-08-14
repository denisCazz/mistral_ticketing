import { describe, expect, it } from "vitest";
import {
  expandSearchQuery,
  inferCategorieFromQuery,
  lexicalSearchQuery,
  matchClienteFromQuery,
} from "@/lib/document-query-intent";

describe("document query intent", () => {
  it("aggiunge sinonimi assicurazione senza togliere la domanda", () => {
    const expanded = expandSearchQuery(
      "quando scade l'assicurazione dell'Iveco"
    );
    expect(expanded).toContain("quando scade");
    expect(expanded.toLowerCase()).toContain("polizza");
    expect(inferCategorieFromQuery(expanded)).toContain("ASSICURAZIONI");
  });

  it("ripulisce la query lessicale per FTS", () => {
    expect(lexicalSearchQuery("RC-auto (scadenza?)")).toMatch(/polizza/i);
    expect(lexicalSearchQuery("RC-auto (scadenza?)")).not.toContain("(");
  });

  it("collega il cliente con la ragione sociale più lunga", () => {
    const hit = matchClienteFromQuery("manutenzione estintori hotel belvedere spa", [
      { id: "c1", ragioneSociale: "SPA" },
      { id: "c2", ragioneSociale: "Hotel Belvedere SPA" },
    ]);
    expect(hit?.id).toBe("c2");
  });

  it("non collega clienti su query troppo generiche", () => {
    expect(
      matchClienteFromQuery("manutenzione", [
        { id: "c1", ragioneSociale: "AB" },
      ])
    ).toBeNull();
  });
});
