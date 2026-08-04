import { StatoPreventivo } from "@prisma/client";

export const STATO_PREVENTIVO_LABELS: Record<StatoPreventivo, string> = {
  BOZZA: "Bozza",
  IN_REVISIONE: "In revisione",
  INVIATO: "Inviato",
  ACCETTATO: "Accettato",
  RIFIUTATO: "Rifiutato",
  SCADUTO: "Scaduto",
};

export const STATO_PREVENTIVO_COLORS: Record<StatoPreventivo, string> = {
  BOZZA: "bg-gray-100 text-gray-700",
  IN_REVISIONE: "bg-yellow-100 text-yellow-800",
  INVIATO: "bg-blue-100 text-blue-800",
  ACCETTATO: "bg-green-100 text-green-800",
  RIFIUTATO: "bg-red-100 text-red-800",
  SCADUTO: "bg-orange-100 text-orange-800",
};

export const STATI_PREVENTIVO_ORDINE: StatoPreventivo[] = [
  "BOZZA",
  "IN_REVISIONE",
  "INVIATO",
  "ACCETTATO",
  "RIFIUTATO",
  "SCADUTO",
];

export const STATI_PREVENTIVO_CHIUSURA: StatoPreventivo[] = [
  "ACCETTATO",
  "RIFIUTATO",
  "SCADUTO",
];

export const STATI_PREVENTIVO_ATTIVI = STATI_PREVENTIVO_ORDINE.filter(
  (s) => !STATI_PREVENTIVO_CHIUSURA.includes(s)
);

export const STATI_PREVENTIVO_OPERATORE: StatoPreventivo[] = [
  "BOZZA",
  "IN_REVISIONE",
  "INVIATO",
  "ACCETTATO",
  "RIFIUTATO",
];

export function statiPreventivoConsentiti(
  role: string | undefined | null
): StatoPreventivo[] {
  if (!role) return [];
  if (role === "ADMIN") return STATI_PREVENTIVO_ORDINE;
  if (role === "OPERATORE") return STATI_PREVENTIVO_OPERATORE;
  return [];
}

export function statiPreventivoTarget(
  role: string | undefined | null,
  statoCorrente: StatoPreventivo
): StatoPreventivo[] {
  const consentiti = statiPreventivoConsentiti(role);
  const candidati = STATI_PREVENTIVO_CHIUSURA.includes(statoCorrente)
    ? STATI_PREVENTIVO_ATTIVI
    : STATI_PREVENTIVO_ORDINE.filter((s) => s !== statoCorrente);
  return candidati.filter((s) => consentiti.includes(s));
}

export function generateNumeroPreventivo(count: number): string {
  const year = new Date().getFullYear();
  const num = String(count).padStart(4, "0");
  return `PREV-${year}-${num}`;
}
