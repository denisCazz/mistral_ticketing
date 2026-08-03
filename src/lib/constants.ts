import { StatoPratica } from "@prisma/client";

export const STATO_LABELS: Record<StatoPratica, string> = {
  RICEVUTA: "Ricevuta",
  PRESA_IN_CARICO: "Presa in carico",
  IN_ATTESA_RICAMBI: "In attesa di ricambi",
  COMPLETATA: "Completata",
  ANNULLATA: "Annullata",
  NON_RISOLVIBILE: "Non risolvibile",
};

export const STATO_COLORS: Record<StatoPratica, string> = {
  RICEVUTA: "bg-blue-100 text-blue-800",
  PRESA_IN_CARICO: "bg-yellow-100 text-yellow-800",
  IN_ATTESA_RICAMBI: "bg-purple-100 text-purple-800",
  COMPLETATA: "bg-green-100 text-green-800",
  ANNULLATA: "bg-gray-100 text-gray-600",
  NON_RISOLVIBILE: "bg-red-100 text-red-800",
};

export const STATI_ORDINE: StatoPratica[] = [
  "RICEVUTA",
  "PRESA_IN_CARICO",
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

/** Stati impostabili dall'operatore sulle pratiche assegnate. */
export const STATI_OPERATORE: StatoPratica[] = [
  "PRESA_IN_CARICO",
  "IN_ATTESA_RICAMBI",
  "COMPLETATA",
  "ANNULLATA",
  "NON_RISOLVIBILE",
];

export function statiConsentitiPerUtente(
  role: string | undefined | null
): StatoPratica[] {
  if (!role) return [];
  if (role === "ADMIN") return STATI_ORDINE;
  if (role === "OPERATORE") return STATI_OPERATORE;
  return [];
}

export function statiTargetDisponibili(
  role: string | undefined | null,
  statoCorrente: StatoPratica
): StatoPratica[] {
  const consentiti = statiConsentitiPerUtente(role);

  const candidati = STATI_CHIUSURA.includes(statoCorrente)
    ? STATI_ATTIVI
    : STATI_ORDINE.filter((s) => s !== statoCorrente);

  return candidati.filter((s) => consentiti.includes(s));
}

export function messaggioStatoNonModificabile(
  role: string | undefined | null
): string | null {
  if (statiConsentitiPerUtente(role).length === 0) {
    return "Il tuo profilo non ha permessi per modificare gli stati.";
  }
  return null;
}

export function generateNumeroPratica(count: number): string {
  const year = new Date().getFullYear();
  const num = String(count).padStart(4, "0");
  return `MIS-${year}-${num}`;
}
