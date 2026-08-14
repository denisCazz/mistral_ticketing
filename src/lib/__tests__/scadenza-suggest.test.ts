import { describe, expect, it } from "vitest";
import { proposeScadenzaForDocument } from "@/lib/scadenza-suggest";

describe("proposeScadenzaForDocument", () => {
  it("usa il titolo se non c'è estrazione AI", () => {
    const r = proposeScadenzaForDocument({
      titolo: "Assicurazione AB123CD scad 03 12 2026.pdf",
      categoria: "ASSICURAZIONI",
    });
    expect(r.suggestedScadenza).toBe("2026-12-03");
    expect(r.suggestedSource).toBe("FILENAME");
    expect(r.canEnqueueAi).toBe(true);
    expect(r.hasAiExtraction).toBe(false);
  });

  it("propone la data AI anche sotto soglia auto-apply e senza evidence", () => {
    const r = proposeScadenzaForDocument({
      titolo: "attestato.pdf",
      categoria: "FORMAZIONE",
      extractionAt: new Date("2026-08-01"),
      extractionJson: {
        extraction: {
          documentType: "attestato",
          personaNome: "Mario",
          personaCognome: "Rossi",
          targa: null,
          enteEmettitore: null,
          numeroDocumento: null,
          tipoCorso: "PLE",
          dataDocumento: null,
          dataRilascio: null,
          dataScadenza: "2027-03-15",
          nonServeScadenza: false,
          confidence: 0.72,
          notes: null,
          evidence: [],
        },
      },
    });
    expect(r.suggestedScadenza).toBe("2027-03-15");
    expect(r.suggestedSource).toBe("AI");
    expect(r.suggestedConfidence).toBeLessThanOrEqual(0.64);
    expect(r.canEnqueueAi).toBe(false);
    expect(r.hasAiExtraction).toBe(true);
  });

  it("preferisce l'AI con evidence se concorda col titolo", () => {
    const r = proposeScadenzaForDocument({
      titolo: "Corso PLE scad 15 03 2027.pdf",
      categoria: "FORMAZIONE",
      extractionJson: {
        extraction: {
          documentType: "attestato",
          personaNome: null,
          personaCognome: null,
          targa: null,
          enteEmettitore: null,
          numeroDocumento: null,
          tipoCorso: "PLE",
          dataDocumento: null,
          dataRilascio: null,
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
      },
    });
    expect(r.suggestedScadenza).toBe("2027-03-15");
    expect(r.suggestedSource).toBe("AI");
    expect(r.suggestedEvidence).toContain("15/03/2027");
    expect(r.suggestedConfidence).toBeGreaterThan(0.88);
  });

  it("propone nonServe quando l'AI lo indica e non c'è data", () => {
    const r = proposeScadenzaForDocument({
      titolo: "visura camerale.pdf",
      categoria: "VISURE",
      extractionJson: {
        extraction: {
          documentType: "visura",
          personaNome: null,
          personaCognome: null,
          targa: null,
          enteEmettitore: "CCIAA",
          numeroDocumento: null,
          tipoCorso: null,
          dataDocumento: "2026-01-10",
          dataRilascio: null,
          dataScadenza: null,
          nonServeScadenza: true,
          confidence: 0.8,
          notes: "Documento informativo",
          evidence: [],
        },
      },
    });
    expect(r.suggestedScadenza).toBeNull();
    expect(r.suggestedNonServe).toBe(true);
    expect(r.hasAiExtraction).toBe(true);
  });

  it("riusa regex.body già salvata nell'extractionJson", () => {
    const r = proposeScadenzaForDocument({
      titolo: "libretto.pdf",
      categoria: "LIBRETTI",
      extractionJson: {
        extraction: {
          documentType: "libretto",
          personaNome: null,
          personaCognome: null,
          targa: "AB123CD",
          enteEmettitore: null,
          numeroDocumento: null,
          tipoCorso: null,
          dataDocumento: null,
          dataRilascio: null,
          dataScadenza: null,
          nonServeScadenza: false,
          confidence: 0.4,
          notes: null,
          evidence: [],
        },
        regex: {
          body: {
            dataScadenza: "2026-11-01T00:00:00.000Z",
            fonte: "OCR",
            confidence: 0.82,
            rawValue: "scade il 01/11/2026",
            statoValidita: "VALIDO",
          },
        },
      },
    });
    expect(r.suggestedScadenza).toBe("2026-11-01");
    expect(r.suggestedSource).toBe("OCR");
  });
});
