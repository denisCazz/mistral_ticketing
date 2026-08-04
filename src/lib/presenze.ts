export const TIPI_PRESENZA = [
  "SEDE",
  "TRASFERTA",
  "MUTUA",
  "PERMESSO",
  "FERIE",
  "FESTIVO",
] as const;

export type TipoPresenza = (typeof TIPI_PRESENZA)[number];

export const TIPO_PRESENZA_LABELS: Record<TipoPresenza, string> = {
  SEDE: "Sede",
  TRASFERTA: "Trasferta",
  MUTUA: "Mutua",
  PERMESSO: "Permesso",
  FERIE: "Ferie",
  FESTIVO: "Festivo",
};

export const TIPO_PRESENZA_SHORT: Record<TipoPresenza, string> = {
  SEDE: "S",
  TRASFERTA: "T",
  MUTUA: "M",
  PERMESSO: "P",
  FERIE: "F",
  FESTIVO: "Fe",
};

export const TIPO_PRESENZA_COLORS: Record<TipoPresenza, string> = {
  SEDE: "bg-emerald-100 text-emerald-800 border-emerald-200",
  TRASFERTA: "bg-sky-100 text-sky-800 border-sky-200",
  MUTUA: "bg-amber-100 text-amber-800 border-amber-200",
  PERMESSO: "bg-violet-100 text-violet-800 border-violet-200",
  FERIE: "bg-orange-100 text-orange-800 border-orange-200",
  FESTIVO: "bg-rose-100 text-rose-800 border-rose-200",
};

export type TariffeDipendente = {
  costoGiornata: number;
  indennitaTrasferta: number;
  costoMutua: number;
  costoPermesso: number;
  costoFerie: number;
  costoFestivo: number;
};

export function resolveTariffe(
  override: Record<keyof TariffeDipendente, unknown | null>,
  standard: TariffeDipendente
): TariffeDipendente {
  return {
    costoGiornata:
      override.costoGiornata == null
        ? standard.costoGiornata
        : Number(override.costoGiornata),
    indennitaTrasferta:
      override.indennitaTrasferta == null
        ? standard.indennitaTrasferta
        : Number(override.indennitaTrasferta),
    costoMutua:
      override.costoMutua == null
        ? standard.costoMutua
        : Number(override.costoMutua),
    costoPermesso:
      override.costoPermesso == null
        ? standard.costoPermesso
        : Number(override.costoPermesso),
    costoFerie:
      override.costoFerie == null
        ? standard.costoFerie
        : Number(override.costoFerie),
    costoFestivo:
      override.costoFestivo == null
        ? standard.costoFestivo
        : Number(override.costoFestivo),
  };
}

export function costoGiorno(
  tipo: TipoPresenza | null | undefined,
  tariffe: TariffeDipendente
): number {
  if (!tipo) return 0;
  switch (tipo) {
    case "SEDE":
      return tariffe.costoGiornata;
    case "TRASFERTA":
      return tariffe.costoGiornata + tariffe.indennitaTrasferta;
    case "MUTUA":
      return tariffe.costoMutua;
    case "PERMESSO":
      return tariffe.costoPermesso;
    case "FERIE":
      return tariffe.costoFerie;
    case "FESTIVO":
      return tariffe.costoFestivo;
    default:
      return 0;
  }
}

export function formatEuro(value: number): string {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
  }).format(value);
}
