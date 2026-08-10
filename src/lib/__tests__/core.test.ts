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

  it("rileva cartella scaduto senza data", () => {
    const r = parseScadenzaFromText("attestato.pdf", "PREPOSTO/Scaduto");
    expect(r.statoValidita).toBe("SCADUTO");
    expect(r.dataScadenza).toBeNull();
  });

  it("estrae data anche da cartella Scaduto", () => {
    const r = parseScadenzaFromText(
      "Ardino Alessio PLE scad. 18 06 26.pdf",
      "PLE ARDINO/Scaduti"
    );
    expect(r.dataScadenza?.getUTCFullYear()).toBe(2026);
    expect(r.dataScadenza?.getUTCMonth()).toBe(5);
    expect(r.dataScadenza?.getUTCDate()).toBe(18);
    expect(r.statoValidita).toBe("SCADUTO");
  });

  it("estrae scad con underscore", () => {
    const r = parseScadenzaFromText(
      "ALISHANI_MARIO__Idoneita scad 17_05_2022.pdf"
    );
    expect(r.dataScadenza?.getUTCFullYear()).toBe(2022);
    expect(r.dataScadenza?.getUTCMonth()).toBe(4);
    expect(r.dataScadenza?.getUTCDate()).toBe(17);
  });

  it("estrae fino al / fino a", () => {
    const r = parseScadenzaFromText(
      "ROSSO MARCO_idoneita lavorativa fino a 16 12 2024.pdf"
    );
    expect(r.dataScadenza?.getUTCFullYear()).toBe(2024);
    expect(r.dataScadenza?.getUTCMonth()).toBe(11);
    expect(r.dataScadenza?.getUTCDate()).toBe(16);
    expect(r.confidence).toBeGreaterThanOrEqual(0.85);
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

describe("parseScadenzaFromBody", () => {
  it("estrae data di scadenza dal corpo", async () => {
    const { parseScadenzaFromBody } = await import("@/lib/scadenza-parser");
    const r = parseScadenzaFromBody(
      "Attestato formazione antincendio.\nData di scadenza: 15/03/2027\nEnte: VV.F."
    );
    expect(r.dataScadenza?.getUTCFullYear()).toBe(2027);
    expect(r.dataScadenza?.getUTCMonth()).toBe(2);
    expect(r.dataScadenza?.getUTCDate()).toBe(15);
    expect(r.fonte).toBe("OCR");
    expect(r.confidence).toBeGreaterThanOrEqual(0.8);
  });
});

describe("entity-match", () => {
  it("collega dipendente univoco", async () => {
    const { matchEntities } = await import("@/lib/entity-match");
    const r = matchEntities({
      personaNome: "Mario",
      personaCognome: "Rossi",
      dipendenti: [
        { id: "d1", nome: "Mario", cognome: "Rossi" },
        { id: "d2", nome: "Luca", cognome: "Bianchi" },
      ],
      automezzi: [],
    });
    expect(r.dipendenteId).toBe("d1");
    expect(r.ambiguousDipendente).toBe(false);
  });

  it("collega targa normalizzata", async () => {
    const { matchEntities } = await import("@/lib/entity-match");
    const r = matchEntities({
      targa: "ab 123 cd",
      dipendenti: [],
      automezzi: [{ id: "a1", targa: "AB123CD" }],
    });
    expect(r.automezzoId).toBe("a1");
  });
});

describe("hybrid document extraction", () => {
  it("auto-applica scadenza quando AI e regex concordano", async () => {
    const { buildHybridExtraction } = await import(
      "@/lib/document-extraction"
    );
    const r = buildHybridExtraction({
      titolo: "Rossi Mario PLE scad 15 03 2027.pdf",
      folderHint: "FORMAZIONE/PLE",
      bodyText:
        "Attestato PLE. Valido fino al 15/03/2027. Intestatario: Mario Rossi.",
      aiRaw: {
        documentType: "attestato_ple",
        personaNome: "Mario",
        personaCognome: "Rossi",
        targa: null,
        enteEmettitore: "Ente Formazione",
        numeroDocumento: "A-1",
        tipoCorso: "PLE",
        dataDocumento: "2025-03-15",
        dataRilascio: "2025-03-15",
        dataScadenza: "2027-03-15",
        nonServeScadenza: false,
        confidence: 0.88,
        notes: null,
        evidence: [
          {
            field: "dataScadenza",
            quote: "Valido fino al 15/03/2027",
            page: 1,
          },
        ],
      },
      entityType: "DIPENDENTE",
      dipendenti: [{ id: "d1", nome: "Mario", cognome: "Rossi" }],
      automezzi: [],
    });
    expect(r.applied.dataScadenza?.toISOString().slice(0, 10)).toBe(
      "2027-03-15"
    );
    expect(r.applied.confermata).toBe(true);
    expect(r.applied.dipendenteId).toBe("d1");
    expect(r.decision).toBe("auto_apply");
  });

  it("richiede revisione sotto soglia auto", async () => {
    const { buildHybridExtraction } = await import(
      "@/lib/document-extraction"
    );
    const r = buildHybridExtraction({
      titolo: "documento generico.pdf",
      bodyText: "Scadenza stimata intorno al 2028.",
      aiRaw: {
        documentType: "altro",
        personaNome: null,
        personaCognome: null,
        targa: null,
        enteEmettitore: null,
        numeroDocumento: null,
        tipoCorso: null,
        dataDocumento: null,
        dataRilascio: null,
        dataScadenza: "2028-12-31",
        nonServeScadenza: false,
        confidence: 0.7,
        notes: null,
        evidence: [
          { field: "dataScadenza", quote: "intorno al 2028", page: null },
        ],
      },
      entityType: "AZIENDA",
      dipendenti: [],
      automezzi: [],
    });
    expect(r.applied.needsReview).toBe(true);
    expect(r.applied.confermata).toBe(false);
    expect(r.decision).toBe("needs_review");
  });
});

describe("document AI queue", () => {
  it("esclude errori terminali dalla coda automatica", async () => {
    const { pendingAiWhere } = await import("@/lib/document-ai-batch");
    const where = pendingAiWhere() as {
      NOT?: { statoIngestione?: { in?: readonly string[] } };
    };

    expect(where.NOT?.statoIngestione?.in).toEqual(
      expect.arrayContaining(["FAILED", "DA_REVISIONARE"])
    );
  });
});
