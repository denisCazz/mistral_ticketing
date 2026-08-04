import { describe, expect, it } from "vitest";
import { calcolaTotaliPreventivo, calcolaRiga } from "@/lib/preventivo-calcoli";
import { parseScadenzaFromText } from "@/lib/scadenza-parser";
import {
  isAiWhitelistCandidate,
  shouldSkipFile,
} from "@/lib/document-whitelist";
import { resolveTariffe } from "@/lib/presenze";
import {
  groupChunksByDocument,
  relevantExcerpt,
} from "@/lib/document-answer-sources";

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

  it("salta archivi compressi", () => {
    expect(shouldSkipFile("doc.zip")).toBe(true);
    expect(shouldSkipFile("archivio.RAR")).toBe(true);
    expect(shouldSkipFile("pack.7z")).toBe(true);
    expect(shouldSkipFile("contratto.pdf")).toBe(false);
  });
});

describe("tariffe dipendente", () => {
  it("usa i costi standard quando non ci sono override", () => {
    const standard = {
      costoGiornata: 100,
      indennitaTrasferta: 30,
      costoMutua: 80,
      costoPermesso: 70,
      costoFerie: 90,
      costoFestivo: 120,
    };

    expect(
      resolveTariffe(
        {
          costoGiornata: null,
          indennitaTrasferta: null,
          costoMutua: null,
          costoPermesso: null,
          costoFerie: null,
          costoFestivo: null,
        },
        standard
      )
    ).toEqual(standard);
  });

  it("mantiene gli override individuali, incluso zero", () => {
    const standard = {
      costoGiornata: 100,
      indennitaTrasferta: 30,
      costoMutua: 80,
      costoPermesso: 70,
      costoFerie: 90,
      costoFestivo: 120,
    };

    expect(
      resolveTariffe(
        {
          costoGiornata: 110,
          indennitaTrasferta: null,
          costoMutua: null,
          costoPermesso: null,
          costoFerie: null,
          costoFestivo: 0,
        },
        standard
      )
    ).toMatchObject({
      costoGiornata: 110,
      indennitaTrasferta: 30,
      costoFestivo: 0,
    });
  });
});

describe("fonti risposta documentale", () => {
  it("assegna un solo indice agli estratti dello stesso documento", () => {
    const sources = groupChunksByDocument(
      [
        {
          documentoId: "doc-1",
          titolo: "Assicurazione.pdf",
          content: "Primo estratto sulla manutenzione.",
          similarity: 0.8,
        },
        {
          documentoId: "doc-1",
          titolo: "Assicurazione.pdf",
          content: "Secondo estratto dello stesso documento.",
          similarity: 0.7,
        },
        {
          documentoId: "doc-2",
          titolo: "Garanzia.pdf",
          content: "Altro documento pertinente.",
          similarity: 0.6,
        },
      ],
      "Quali documenti parlano di manutenzione?"
    );

    expect(sources).toHaveLength(2);
    expect(sources.map((source) => source.index)).toEqual([1, 2]);
    expect(sources[0].content).toContain("Secondo estratto");
  });

  it("centra l'anteprima sul termine cercato", () => {
    const excerpt = relevantExcerpt(
      `${"Testo introduttivo non pertinente. ".repeat(15)}Le operazioni di manutenzione periodica sono previste dal contratto.`,
      "Quali documenti parlano di manutenzione?"
    );

    expect(excerpt).toContain("manutenzione periodica");
    expect(excerpt.length).toBeLessThanOrEqual(280);
  });
});
