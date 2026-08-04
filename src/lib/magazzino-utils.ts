export function isLowStock(quantita: number, sogliaMinima: number): boolean {
  return sogliaMinima > 0 && quantita <= sogliaMinima;
}

/** Normalizza codice scansionato */
export function normalizeScanCode(raw: string): string {
  return raw.trim();
}

export function looksLikeEan(code: string): boolean {
  return /^\d{8}$|^\d{12}$|^\d{13}$|^\d{14}$/.test(code);
}
