export const CATEGORIE_COSTO_ACCESSORIO = [
  "VITTO",
  "ALLOGGIO",
  "RIMBORSO_CHILOMETRICO",
  "PEDAGGI",
  "STRAORDINARI",
  "DPI",
  "FORMAZIONE",
  "VISITA_MEDICA",
  "ALTRO",
] as const;

export type CategoriaCostoAccessorio =
  (typeof CATEGORIE_COSTO_ACCESSORIO)[number];

export const CATEGORIA_COSTO_ACCESSORIO_LABELS: Record<
  CategoriaCostoAccessorio,
  string
> = {
  VITTO: "Vitto",
  ALLOGGIO: "Alloggio",
  RIMBORSO_CHILOMETRICO: "Rimborso chilometrico",
  PEDAGGI: "Pedaggi",
  STRAORDINARI: "Straordinari",
  DPI: "DPI",
  FORMAZIONE: "Formazione",
  VISITA_MEDICA: "Visita medica",
  ALTRO: "Altro",
};
