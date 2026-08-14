import { describe, expect, it } from "vitest";
import {
  finestraScadenze,
  formatoDataScadenza,
  groupScadenzeByHorizon,
  horizonForGiorni,
  matchesFiltroAgenda,
  parseFiltroAgenda,
  urgenzaScadenza,
} from "@/lib/scadenza-agenda";

describe("scadenza-agenda", () => {
  it("classifica l'orizzonte per giorni rimanenti", () => {
    expect(horizonForGiorni(-3)).toBe("scadute");
    expect(horizonForGiorni(0)).toBe("oggi");
    expect(horizonForGiorni(4)).toBe("settimana");
    expect(horizonForGiorni(20)).toBe("mese");
    expect(horizonForGiorni(60)).toBe("oltre");
  });

  it("raggruppa in sezioni non vuote, scadute per prime", () => {
    const groups = groupScadenzeByHorizon([
      { id: "a", giorniRimanenti: 40 },
      { id: "b", giorniRimanenti: -2 },
      { id: "c", giorniRimanenti: 0 },
      { id: "d", giorniRimanenti: 5 },
    ]);
    expect(groups.map((g) => g.key)).toEqual([
      "scadute",
      "oggi",
      "settimana",
      "oltre",
    ]);
    expect(groups[0].items).toEqual([{ id: "b", giorniRimanenti: -2 }]);
  });

  it("filtra agenda per urgenza e conferma", () => {
    const scaduta = { giorniRimanenti: -1, confermata: true };
    const urgente = { giorniRimanenti: 3, confermata: false };
    const mese = { giorniRimanenti: 20, confermata: true };
    expect(matchesFiltroAgenda(scaduta, "scadute")).toBe(true);
    expect(matchesFiltroAgenda(urgente, "urgenti")).toBe(true);
    expect(matchesFiltroAgenda(scaduta, "urgenti")).toBe(false);
    expect(matchesFiltroAgenda(mese, "mese")).toBe(true);
    expect(matchesFiltroAgenda(urgente, "da-confermare")).toBe(true);
    expect(matchesFiltroAgenda(mese, "da-confermare")).toBe(false);
    expect(parseFiltroAgenda("urgenti")).toBe("urgenti");
    expect(parseFiltroAgenda("nope")).toBe("tutte");
  });

  it("etichetta le scadute invece di 'scade domani'", () => {
    expect(urgenzaScadenza(-1).label).toBe("Scaduta ieri");
    expect(urgenzaScadenza(-8).label).toBe("Scaduta da 8 giorni");
    expect(urgenzaScadenza(0).label).toBe("Scade oggi");
    expect(urgenzaScadenza(1).label).toBe("Scade domani");
  });

  it("include oggi nella finestra, non l'istante corrente", () => {
    const now = new Date(2026, 7, 14, 16, 9, 0);
    const { from, to, start, end7 } = finestraScadenze(90, 90, now);
    expect(start).toEqual(new Date(2026, 7, 14));
    expect(from).toEqual(new Date(2026, 4, 16));
    expect(to.getDate()).toBe(12);
    expect(to.getMonth()).toBe(10);
    expect(to.getHours()).toBe(23);
    expect(end7.getDate()).toBe(21);
    expect(start.getTime()).toBeLessThan(now.getTime());
  });

  it("formatta date-only in UTC per evitare lo shift di fuso", () => {
    expect(formatoDataScadenza("2026-08-14")).toMatch(/14/);
    expect(formatoDataScadenza("2026-08-14T00:00:00.000Z")).toMatch(/14/);
  });
});
