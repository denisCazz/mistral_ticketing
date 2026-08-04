/** Categorie standard per navigazione e upload. */

export const ENTITY_LABELS = {
  AZIENDA: "Azienda",
  DIPENDENTE: "Dipendenti",
  AUTOMEZZO: "Automezzi",
} as const;

export type EntityTypeKey = keyof typeof ENTITY_LABELS;

export const CATEGORIE_DIPENDENTE = [
  "FORMAZIONE",
  "ANTINCENDIO",
  "PLE",
  "PES PAV",
  "PREPOSTO",
  "RSPP",
  "PRIMO SOCCORSO",
  "DPI III CAT",
  "CONSEGNA DPI",
  "DOC",
  "IDONEITA",
  "UNILAV",
  "APPRENDISTATO",
  "ALTRO",
] as const;

export const CATEGORIE_AUTOMEZZO = [
  "LIBRETTI",
  "ASSICURAZIONI",
  "ALTRO",
] as const;

export const CATEGORIE_AZIENDA = [
  "CCIAA",
  "DOC SICUREZZA E DICHIARAZIONI PER PIATTAFORME",
  "DURC",
  "DURF",
  "F24",
  "VISURE",
  "ALTRO",
] as const;

export function categorieForEntity(entityType: EntityTypeKey): readonly string[] {
  if (entityType === "DIPENDENTE") return CATEGORIE_DIPENDENTE;
  if (entityType === "AUTOMEZZO") return CATEGORIE_AUTOMEZZO;
  return CATEGORIE_AZIENDA;
}

const CATEGORY_RULES: Array<[RegExp, string]> = [
  [/DPI\s*(III|3)\s*(CAT|CATEGORIA)/i, "DPI III CAT"],
  [/CONSEGNA\s+DPI/i, "CONSEGNA DPI"],
  [/PRIMO\s+SOCCORSO/i, "PRIMO SOCCORSO"],
  [/PES[\s/-]*PAV|\bPES\b|\bPAV\b/i, "PES PAV"],
  [/FORMAZIONE/i, "FORMAZIONE"],
  [/ANTINCENDIO/i, "ANTINCENDIO"],
  [/\bPREPOSTO\b/i, "PREPOSTO"],
  [/\bIDONEIT[AÀ](')?\b/i, "IDONEITA"],
  [/\bUNILAV\b/i, "UNILAV"],
  [/\bAPPRENDISTATO\b/i, "APPRENDISTATO"],
  [/\bASSICURAZION/i, "ASSICURAZIONI"],
  [/\bLIBRETT/i, "LIBRETTI"],
  [/\bVISUR/i, "VISURE"],
  [/\bDURC\b/i, "DURC"],
  [/\bDURF\b/i, "DURF"],
  [/\bF24\b/i, "F24"],
  [/\bCCIAA\b/i, "CCIAA"],
  [/\bPLE\b/i, "PLE"],
  [/\bRSPP\b/i, "RSPP"],
  [/\bDOC(UMENTO|UMENTI)?\b/i, "DOCUMENTI PERSONALI"],
];

/** Raggruppa nomi cartella incoerenti in categorie navigabili. */
export function canonicalCategoria(categoria: string): string {
  const clean = categoria.replace(/\s+/g, " ").trim();
  for (const [pattern, label] of CATEGORY_RULES) {
    if (pattern.test(clean)) return label;
  }
  return clean || "ALTRO";
}
