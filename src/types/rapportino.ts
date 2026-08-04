import type {
  SiNoNc,
  Settore,
  TipologiaIntervento,
} from "@/lib/rapportino-constants";

export interface RapportinoCliente {
  id: string;
  ragioneSociale: string;
  nome?: string | null;
  cognome?: string | null;
  indirizzo?: string | null;
  citta?: string | null;
  cap?: string | null;
  provincia?: string | null;
  cellulare?: string | null;
  telFisso?: string | null;
  email?: string | null;
}

export interface RapportinoUtente {
  id: string;
  name: string;
  email: string;
  qualifica?: string | null;
}

export interface RapportinoDTO {
  id: string;
  utenteId: string;
  clienteId: string;
  dataRichiesta?: string | null;
  dataIntervento: string;
  oraIntervento?: string | null;
  tipologiaIntervento?: TipologiaIntervento | string | null;
  settore: Settore | string;
  tipoImpianto: string;
  marca: string;
  modello: string;
  numeroSerie?: string | null;
  dataAcquisto?: string | null;
  rivenditore?: string | null;
  tipoIntervento: string;
  motivoChiamata?: string | null;
  codiceErrore?: string | null;
  verifiche?: string | null;
  installazioneEseguitaDa?: string | null;
  descrizione: string;
  spiegataManutenzione?: SiNoNc | string | null;
  accessibilita?: SiNoNc | string | null;
  integritaComponente?: SiNoNc | string | null;
  conformitaNormativa?: SiNoNc | string | null;
  esitoFunzionamento?: SiNoNc | string | null;
  presaVisioneCondizioniGaranzia?: boolean | null;
  ubicazione?: string | null;
  noteUbicazione?: string | null;
  prossimoIntervento?: string | null;
  materialiUtilizzati?: string | null;
  note?: string | null;
  firmaClientePrivacy?: string | null;
  firmaOperatore?: string | null;
  firmaCliente?: string | null;
  createdAt: string;
  updatedAt: string;
  cliente?: RapportinoCliente;
  utente?: RapportinoUtente;
}

export interface AziendaSettingsDTO {
  id: string;
  nomeAzienda: string;
  logo?: string | null;
  indirizzo?: string | null;
  partitaIva?: string | null;
  telefono?: string | null;
  email?: string | null;
}

export function toDateOnlyString(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (typeof value === "string") return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}
