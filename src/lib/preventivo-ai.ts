export interface PreventivoAiBozza {
  introduzione: string;
  condizioni: string;
  righe: Array<{
    descrizione: string;
    quantita: number;
    prezzoUnitario: number;
    scontoPercentuale: number;
    aliquotaIva: number;
  }>;
}

/** Accetta sia `{ introduzione, ... }` sia la forma annidata `{ output: { ... } }` da bug legacy. */
export function normalizePreventivoBozza(raw: unknown): PreventivoAiBozza | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const candidate =
    obj.introduzione !== undefined || obj.righe !== undefined || obj.condizioni !== undefined
      ? obj
      : obj.output && typeof obj.output === "object"
        ? (obj.output as Record<string, unknown>)
        : null;
  if (!candidate) return null;

  const righeRaw = Array.isArray(candidate.righe) ? candidate.righe : [];
  const righe = righeRaw.map((r) => {
    const row = (r && typeof r === "object" ? r : {}) as Record<string, unknown>;
    return {
      descrizione: String(row.descrizione ?? ""),
      quantita: Number(row.quantita) || 1,
      prezzoUnitario: Number(row.prezzoUnitario) || 0,
      scontoPercentuale: Number(row.scontoPercentuale) || 0,
      aliquotaIva: Number(row.aliquotaIva) || 22,
    };
  });

  return {
    introduzione: String(candidate.introduzione ?? ""),
    condizioni: String(candidate.condizioni ?? ""),
    righe,
  };
}

export function isPreventivoBozzaEmpty(bozza: PreventivoAiBozza): boolean {
  const hasText =
    bozza.introduzione.trim().length > 0 || bozza.condizioni.trim().length > 0;
  const hasRighe = bozza.righe.some((r) => r.descrizione.trim().length > 0);
  return !hasText && !hasRighe;
}
