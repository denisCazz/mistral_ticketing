export const SETTORE_VALUES = ["antincendio", "elettrico"] as const;

export type Settore = (typeof SETTORE_VALUES)[number];

export const SETTORE_LABELS: Record<Settore, string> = {
  antincendio: "Antincendio",
  elettrico: "Elettrico",
};

export const TIPO_IMPIANTO_BY_SETTORE: Record<Settore, readonly string[]> = {
  antincendio: [
    "estintore",
    "idrante",
    "naspo",
    "porta_rei",
    "rilevazione_incendi",
    "illuminazione_emergenza",
    "sprinkler",
    "maniglione_antipanico",
    "altro_antincendio",
  ],
  elettrico: [
    "quadro_elettrico",
    "impianto_civile",
    "impianto_industriale",
    "messa_a_terra",
    "protezione_differenziale",
    "illuminazione",
    "citofonia_videosorveglianza",
    "altro_elettrico",
  ],
} as const;

export type TipoImpianto =
  (typeof TIPO_IMPIANTO_BY_SETTORE)[Settore][number];

export const TIPO_IMPIANTO_LABELS: Record<string, string> = {
  estintore: "Estintore",
  idrante: "Idrante",
  naspo: "Naspo",
  porta_rei: "Porta REI",
  rilevazione_incendi: "Rilevazione incendi",
  illuminazione_emergenza: "Illuminazione di emergenza",
  sprinkler: "Sprinkler / spegnimento automatico",
  maniglione_antipanico: "Maniglione antipanico",
  altro_antincendio: "Altro (antincendio)",
  quadro_elettrico: "Quadro elettrico",
  impianto_civile: "Impianto civile",
  impianto_industriale: "Impianto industriale",
  messa_a_terra: "Messa a terra",
  protezione_differenziale: "Protezione differenziale",
  illuminazione: "Illuminazione",
  citofonia_videosorveglianza: "Citofonia / videosorveglianza",
  altro_elettrico: "Altro (elettrico)",
};

export const TIPOLOGIA_INTERVENTO_VALUES = [
  "messa_in_servizio",
  "manutenzione_periodica",
  "verifica",
  "guasto",
  "collaudo",
  "in_garanzia",
  "non_in_garanzia",
] as const;

export type TipologiaIntervento = (typeof TIPOLOGIA_INTERVENTO_VALUES)[number];

export const TIPOLOGIA_INTERVENTO_LABELS: Record<TipologiaIntervento, string> = {
  messa_in_servizio: "Messa in servizio",
  manutenzione_periodica: "Manutenzione periodica",
  verifica: "Verifica",
  guasto: "Guasto / riparazione",
  collaudo: "Collaudo",
  in_garanzia: "In garanzia",
  non_in_garanzia: "Non in garanzia",
};

export const UBICAZIONE_BY_SETTORE: Record<Settore, readonly string[]> = {
  antincendio: [
    "a_parete",
    "a_terra",
    "cassonetto",
    "vano_tecnico",
    "via_fuga",
    "altro",
  ],
  elettrico: [
    "quadro_generale",
    "quadro_secondario",
    "locale_tecnico",
    "linea",
    "locale_utenza",
    "altro",
  ],
} as const;

export type Ubicazione = (typeof UBICAZIONE_BY_SETTORE)[Settore][number];

export const UBICAZIONE_LABELS: Record<string, string> = {
  a_parete: "A parete",
  a_terra: "A terra",
  cassonetto: "In cassonetto / armadio",
  vano_tecnico: "Vano tecnico",
  via_fuga: "Via di fuga / compartimento",
  quadro_generale: "Quadro generale",
  quadro_secondario: "Quadro secondario",
  locale_tecnico: "Locale tecnico",
  linea: "Linea / cavidotto",
  locale_utenza: "Locale utenza",
  altro: "Altro",
};

export const SI_NO_NC_VALUES = ["si", "no", "nc"] as const;

export type SiNoNc = (typeof SI_NO_NC_VALUES)[number];

export const SI_NO_NC_LABELS: Record<SiNoNc, string> = {
  si: "Sì",
  no: "No",
  nc: "N.C.",
};

const CONTROLLO_COMMON = [
  {
    key: "spiegataManutenzione" as const,
    label: "Spiegata manutenzione ordinaria e straordinaria",
  },
];

const CONTROLLO_ANTINCENDIO = [
  ...CONTROLLO_COMMON,
  {
    key: "accessibilita" as const,
    label: "Apparecchiatura accessibile e segnaletica presente",
  },
  {
    key: "integritaComponente" as const,
    label: "Integrità / carica / pressione entro i limiti",
  },
  {
    key: "conformitaNormativa" as const,
    label: "Conformità normativa (UNI 9994 / norme applicabili)",
  },
  {
    key: "esitoFunzionamento" as const,
    label: "Esito prova di funzionamento positivo",
  },
];

const CONTROLLO_ELETTRICO = [
  ...CONTROLLO_COMMON,
  {
    key: "accessibilita" as const,
    label: "Quadro / componenti accessibili e identificati",
  },
  {
    key: "integritaComponente" as const,
    label: "Integrità cavi, morsetti e protezioni",
  },
  {
    key: "conformitaNormativa" as const,
    label: "Conformità normativa (CEI 64-8 / D.M. 37/08)",
  },
  {
    key: "esitoFunzionamento" as const,
    label: "Esito verifiche elettriche positivo",
  },
];

export type ControlloKey =
  | "spiegataManutenzione"
  | "accessibilita"
  | "integritaComponente"
  | "conformitaNormativa"
  | "esitoFunzionamento";

export function getControlloFields(settore: Settore) {
  return settore === "elettrico" ? CONTROLLO_ELETTRICO : CONTROLLO_ANTINCENDIO;
}

export const CONDIZIONI_GARANZIA_INTRO =
  "La garanzia del produttore o la responsabilità dell'installatore possono decadere nei casi previsti dalle condizioni di vendita e assistenza, tra cui:";

export const CONDIZIONI_GARANZIA_ITEMS = [
  "Installazione non conforme alle normative vigenti e alle istruzioni del costruttore",
  "Mancata esecuzione della manutenzione periodica prevista",
  "Utilizzo improprio dell'impianto o dell'apparecchiatura",
  "Manomissione o modifica non autorizzata",
  "Interventi eseguiti da personale non autorizzato",
  "Danni da eventi eccezionali non imputabili al manutentore",
] as const;

export const CONDIZIONI_GARANZIA_DICHIARAZIONE =
  "Il cliente dichiara di aver preso visione delle suddette condizioni.";

export const CONDIZIONI_GARANZIA_CHECKBOX_LABEL =
  "Presa visione delle condizioni di garanzia / responsabilità";

export function formatSiNoNc(value?: SiNoNc | null): string {
  if (!value) return "—";
  return SI_NO_NC_LABELS[value];
}

export function formatSettore(value?: Settore | string | null): string {
  if (!value) return "—";
  if (value in SETTORE_LABELS) return SETTORE_LABELS[value as Settore];
  return value;
}

export function formatTipoImpianto(value?: string | null): string {
  if (!value) return "—";
  return TIPO_IMPIANTO_LABELS[value] || value;
}

export function formatTipologiaIntervento(
  value?: TipologiaIntervento | string | null
): string {
  if (!value) return "—";
  if (value in TIPOLOGIA_INTERVENTO_LABELS) {
    return TIPOLOGIA_INTERVENTO_LABELS[value as TipologiaIntervento];
  }
  return value;
}

export function formatUbicazione(value?: string | null): string {
  if (!value) return "—";
  return UBICAZIONE_LABELS[value] || value;
}

/** @deprecated alias — prefer formatUbicazione */
export function formatTipologiaInstallazione(value?: string | null): string {
  return formatUbicazione(value);
}

export const CODICI_ERRORE = [
  { codice: "A01", descrizione: "Pressione / carica fuori soglia" },
  { codice: "A02", descrizione: "Componente danneggiato o mancante" },
  { codice: "A03", descrizione: "Segnaletica assente o non conforme" },
  { codice: "A04", descrizione: "Accesso ostruito" },
  { codice: "E01", descrizione: "Intervento differenziale / magneto-termico" },
  { codice: "E02", descrizione: "Discontinuità messa a terra" },
  { codice: "E03", descrizione: "Surriscaldamento / anomalia termica" },
  { codice: "E04", descrizione: "Morsetti / cablaggio non a norma" },
] as const;

export type CodiceErrore = (typeof CODICI_ERRORE)[number]["codice"];

export function getCodiceErroreDescrizione(codice?: string | null): string | undefined {
  if (!codice) return undefined;
  return CODICI_ERRORE.find((e) => e.codice === codice)?.descrizione;
}

export function formatCodiceErrore(codice?: string | null): string {
  if (!codice) return "—";
  const desc = getCodiceErroreDescrizione(codice);
  return desc ? `${codice} — ${desc}` : codice;
}
