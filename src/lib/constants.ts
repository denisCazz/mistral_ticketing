import { StatoPratica } from "@prisma/client";

export const STATO_LABELS: Record<StatoPratica, string> = {
  RICEVUTA: "Ricevuta",
  PRESA_IN_CARICO: "Presa in carico",
  PRESA_IN_CARICO_MANUTENTORE: "Presa in carico da manutentore",
  IN_ATTESA_RICAMBI: "In attesa di ricambi",
  COMPLETATA: "Completata",
  ANNULLATA: "Annullata",
  NON_RISOLVIBILE: "Non risolvibile",
};

export const STATO_COLORS: Record<StatoPratica, string> = {
  RICEVUTA: "bg-blue-100 text-blue-800",
  PRESA_IN_CARICO: "bg-yellow-100 text-yellow-800",
  PRESA_IN_CARICO_MANUTENTORE: "bg-orange-100 text-orange-800",
  IN_ATTESA_RICAMBI: "bg-purple-100 text-purple-800",
  COMPLETATA: "bg-green-100 text-green-800",
  ANNULLATA: "bg-gray-100 text-gray-600",
  NON_RISOLVIBILE: "bg-red-100 text-red-800",
};

export const STATI_ORDINE: StatoPratica[] = [
  "RICEVUTA",
  "PRESA_IN_CARICO",
  "PRESA_IN_CARICO_MANUTENTORE",
  "IN_ATTESA_RICAMBI",
  "COMPLETATA",
  "ANNULLATA",
  "NON_RISOLVIBILE",
];

export const STATI_CHIUSURA: StatoPratica[] = [
  "COMPLETATA",
  "ANNULLATA",
  "NON_RISOLVIBILE",
];

export const STATI_ATTIVI: StatoPratica[] = STATI_ORDINE.filter(
  (s) => !STATI_CHIUSURA.includes(s)
);

// Stati da cui il CAT può iniziare a lavorare (dopo la presa in carico Mistral).
// Il CAT non agisce finché la pratica è in RICEVUTA.
export const STATI_CAT: StatoPratica[] = [
  "PRESA_IN_CARICO_MANUTENTORE",
  "IN_ATTESA_RICAMBI",
  "COMPLETATA",
  "NON_RISOLVIBILE",
];

// Stati impostabili dall'operatore interno Mistral (senza CAT).
export const STATI_OPERATORE_INTERNO: StatoPratica[] = [
  "PRESA_IN_CARICO",
  "ANNULLATA",
];

export function isCatOperatore(
  role: string | undefined | null,
  catId: string | undefined | null
): boolean {
  // Utente collegato a un CAT (indipendentemente dal ruolo, tranne admin).
  return Boolean(catId) && role !== "ADMIN";
}

// Stati che un utente può impostare in base a ruolo e CAT collegato.
export function statiConsentitiPerUtente(
  role: string | undefined | null,
  catId: string | undefined | null
): StatoPratica[] {
  if (!role) return [];
  if (role === "ADMIN") return STATI_ORDINE;
  // Utente collegato a un CAT: permessi da operatore CAT anche se il ruolo
  // nel DB è MANUTENTORE (compatibilità con utenti già creati).
  if (catId) return STATI_CAT;
  if (role === "MANUTENTORE") return [];
  return STATI_OPERATORE_INTERNO;
}

// Stati selezionabili in base allo stato attuale della pratica.
export function statiTargetDisponibili(
  role: string | undefined | null,
  catId: string | undefined | null,
  statoCorrente: StatoPratica
): StatoPratica[] {
  const consentiti = statiConsentitiPerUtente(role, catId);

  // Il CAT interviene solo dopo la presa in carico Mistral (non da RICEVUTA).
  if (isCatOperatore(role, catId) && statoCorrente === "RICEVUTA") {
    return [];
  }

  const candidati = STATI_CHIUSURA.includes(statoCorrente)
    ? STATI_ATTIVI
    : STATI_ORDINE.filter((s) => s !== statoCorrente);

  return candidati.filter((s) => consentiti.includes(s));
}

export function messaggioStatoNonModificabile(
  role: string | undefined | null,
  catId: string | undefined | null,
  statoCorrente: StatoPratica
): string | null {
  if (isCatOperatore(role, catId) && statoCorrente === "RICEVUTA") {
    return "In attesa di presa in carico da Mistral Impianti. Potrai aggiornare lo stato quando un operatore interno imposta «Presa in carico».";
  }
  if (statiConsentitiPerUtente(role, catId).length === 0) {
    return "Il tuo profilo non ha permessi per modificare gli stati.";
  }
  return null;
}

export function generateNumeroPratica(count: number): string {
  const year = new Date().getFullYear();
  const num = String(count).padStart(4, "0");
  return `MIS-${year}-${num}`;
}
