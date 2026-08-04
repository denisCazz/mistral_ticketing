import { describe, expect, it } from "vitest";
import { calcolaTotaliPreventivo, calcolaRiga } from "@/lib/preventivo-calcoli";
import { parseScadenzaFromText } from "@/lib/scadenza-parser";
import { isAiWhitelistCandidate } from "@/lib/document-whitelist";

describe("preventivo-calcoli", () => {
  it("calcola riga con sconto e IVA", () => {
    const r = calcolaRiga({
      descrizione: "test",
      quantita: 2,
      prezzoUnitario: 100,
      scontoPercentuale: 10,
      aliquotaIva: 22,
    });
    expect(r.imponibile).toBe(180);
    expect(r.iva).toBe(39.6);
    expect(r.totale).toBe(219.6);
  });

  it("calcola totali preventivo", () => {
    const t = calcolaTotaliPreventivo([
      {
        descrizione: "a",
        quantita: 1,
        prezzoUnitario: 100,
        scontoPercentuale: 0,
        aliquotaIva: 22,
      },
    ]);
    expect(t.totaleImponibile).toBe(100);
    expect(t.totaleIva).toBe(22);
    expect(t.totaleFinale).toBe(122);
  });
});

describe("scadenza-parser", () => {
  it("estrae scadenza da filename", () => {
    const r = parseScadenzaFromText(
      "Assicurazione AB123CD scad 03 12 2026.pdf",
      "AUTOMEZZI/ASSICURAZIONI"
    );
    expect(r.dataScadenza?.getFullYear()).toBe(2026);
    expect(r.confidence).toBeGreaterThan(0.8);
  });

  it("rileva cartella scaduto", () => {
    const r = parseScadenzaFromText("attestato.pdf", "PREPOSTO/Scaduto");
    expect(r.statoValidita).toBe("SCADUTO");
  });
});

describe("document-whitelist", () => {
  it("esclude UNILAV", () => {
    expect(isAiWhitelistCandidate("UNILAV", null, "DIPENDENTI/x")).toBe(false);
  });

  it("include formazione", () => {
    expect(
      isAiWhitelistCandidate("FORMAZIONE", "ANTINCENDIO", "DIPENDENTI/x")
    ).toBe(true);
  });
});
