export type HorizonKey = "scadute" | "oggi" | "settimana" | "mese" | "oltre";

export type FiltroAgenda =
  | "tutte"
  | "scadute"
  | "urgenti"
  | "mese"
  | "da-confermare";

export const HORIZON_LABELS: Record<HorizonKey, string> = {
  scadute: "Già scadute",
  oggi: "Oggi",
  settimana: "Entro 7 giorni",
  mese: "Entro 30 giorni",
  oltre: "Oltre 30 giorni",
};

export const FILTRO_AGENDA_VALUES: FiltroAgenda[] = [
  "tutte",
  "scadute",
  "urgenti",
  "mese",
  "da-confermare",
];

export function parseFiltroAgenda(value: string | null): FiltroAgenda {
  if (value && FILTRO_AGENDA_VALUES.includes(value as FiltroAgenda)) {
    return value as FiltroAgenda;
  }
  return "tutte";
}

export function inizioGiornoLocale(date = new Date()): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function clampInt(value: string | null, fallback: number, min: number, max: number) {
  const parsed = parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

/** Finestra inclusiva: da `passate` giorni fa (inizio giorno) a `giorni` nel futuro (fine giorno). */
export function finestraScadenze(giorniFuturi = 90, giorniPassati = 90, now = new Date()) {
  const start = inizioGiornoLocale(now);
  const from = new Date(start);
  from.setDate(from.getDate() - giorniPassati);
  const to = new Date(start);
  to.setDate(to.getDate() + giorniFuturi);
  to.setHours(23, 59, 59, 999);
  const end7 = new Date(start);
  end7.setDate(end7.getDate() + 7);
  end7.setHours(23, 59, 59, 999);
  return { from, to, start, end7 };
}

export function horizonForGiorni(giorni: number): HorizonKey {
  if (giorni < 0) return "scadute";
  if (giorni === 0) return "oggi";
  if (giorni <= 7) return "settimana";
  if (giorni <= 30) return "mese";
  return "oltre";
}

export function groupScadenzeByHorizon<T extends { giorniRimanenti: number }>(
  rows: T[]
): { key: HorizonKey; label: string; items: T[] }[] {
  const order: HorizonKey[] = ["scadute", "oggi", "settimana", "mese", "oltre"];
  const buckets = new Map<HorizonKey, T[]>(order.map((key) => [key, []]));
  for (const row of rows) {
    buckets.get(horizonForGiorni(row.giorniRimanenti))!.push(row);
  }
  return order
    .map((key) => ({
      key,
      label: HORIZON_LABELS[key],
      items: buckets.get(key)!,
    }))
    .filter((group) => group.items.length > 0);
}

export function matchesFiltroAgenda(
  row: { giorniRimanenti: number; confermata: boolean },
  filtro: FiltroAgenda
): boolean {
  switch (filtro) {
    case "scadute":
      return row.giorniRimanenti < 0;
    case "urgenti":
      return row.giorniRimanenti >= 0 && row.giorniRimanenti <= 7;
    case "mese":
      return row.giorniRimanenti >= 0 && row.giorniRimanenti <= 30;
    case "da-confermare":
      return !row.confermata;
    default:
      return true;
  }
}

export function urgenzaScadenza(giorni: number) {
  if (giorni < 0) {
    const n = Math.abs(giorni);
    return {
      label: n === 1 ? "Scaduta ieri" : `Scaduta da ${n} giorni`,
      badge: "border-red-200 bg-red-50 text-red-800",
      accent: "bg-red-600",
    };
  }
  if (giorni === 0) {
    return {
      label: "Scade oggi",
      badge: "border-red-200 bg-red-50 text-red-700",
      accent: "bg-red-500",
    };
  }
  if (giorni === 1) {
    return {
      label: "Scade domani",
      badge: "border-red-200 bg-red-50 text-red-700",
      accent: "bg-red-500",
    };
  }
  if (giorni <= 7) {
    return {
      label: `${giorni} giorni`,
      badge: "border-orange-200 bg-orange-50 text-orange-700",
      accent: "bg-orange-500",
    };
  }
  if (giorni <= 30) {
    return {
      label: `${giorni} giorni`,
      badge: "border-amber-200 bg-amber-50 text-amber-700",
      accent: "bg-amber-400",
    };
  }
  return {
    label: `${giorni} giorni`,
    badge: "border-sky-200 bg-sky-50 text-sky-700",
    accent: "bg-sky-500",
  };
}

export function formatoDataScadenza(data: string | Date) {
  const iso = typeof data === "string" ? data : data.toISOString();
  const day = iso.slice(0, 10);
  const [y, m, d] = day.split("-").map((part) => parseInt(part, 10));
  if (!y || !m || !d) return day;
  return new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}
