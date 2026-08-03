import * as XLSX from "xlsx";

export interface ClienteRow {
  id?: string;
  ragioneSociale: string;
  indirizzo?: string;
  cap?: string;
  citta?: string;
  provincia?: string;
  telFisso?: string;
  cellulare?: string;
  email?: string;
  note1?: string;
  note2?: string;
  note3?: string;
  statoAnagrafica?: string;
  motivoControllo?: string;
}

const INVALID_VALUES = /^(#NOME\?|#N\/A|#REF!|#VALORE!|#DIV\/0!|n\.?\/?a\.?|null|undefined|-)$/i;

function pick(row: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = String(row[key] ?? "").trim();
    if (value && !INVALID_VALUES.test(value)) return value;
  }
  return "";
}

function normalizeKey(key: string): string {
  return key
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function pickFuzzy(row: Record<string, unknown>, ...patterns: RegExp[]): string {
  for (const [key, value] of Object.entries(row)) {
    const normalizedKey = normalizeKey(key);
    if (!patterns.some((p) => p.test(normalizedKey))) continue;
    const text = String(value ?? "").trim();
    if (text && !INVALID_VALUES.test(text)) return text;
  }
  return "";
}

function parseLocation(raw?: string): { citta?: string; provincia?: string } {
  if (!raw) return {};
  const match = raw.match(/^(.+?)\s*\(([A-Z]{2})\)\s*$/i);
  if (match) {
    return { citta: match[1].trim(), provincia: match[2].toUpperCase() };
  }
  return { citta: raw.trim() };
}

function buildRagioneSociale(row: Record<string, unknown>): string {
  const direct = pick(
    row,
    "Ragione sociale / Nome",
    "Ragione sociale",
    "RagioneSociale",
    "ragione_sociale",
    "Cliente",
    "Denominazione",
    "Intestatario"
  );
  if (direct) return direct;

  const cognome = pick(row, "Cognome", "COGNOME", "cognome");
  const nome = pick(row, "Nome", "NOME", "nome");
  const combined = [cognome, nome].filter(Boolean).join(" ").trim();
  if (combined) return combined;

  return pickFuzzy(row, /ragionesociale/, /denominazione/, /^cliente$/, /intestatario/);
}

function mapRow(row: Record<string, unknown>): ClienteRow {
  const comuneRaw = pick(
    row,
    "Città",
    "Citta",
    "Comune",
    "Località",
    "Localita",
    "Citta e provincia"
  ) || pickFuzzy(row, /^citta$/, /^comune$/, /localita/);

  const { citta, provincia: provinciaFromComune } = parseLocation(comuneRaw);
  const provincia =
    pick(row, "Provincia", "Prov", "Sigla provincia") ||
    provinciaFromComune ||
    pickFuzzy(row, /^provincia$/, /^prov$/);

  const cellulare =
    pick(row, "Cellulare", "Telefono cellulare", "Tel cellulare", "Mobile") ||
    pickFuzzy(row, /cellulare/, /mobile/);

  const telFisso =
    pick(row, "Telefono fisso", "TelFisso", "Telefono", "Tel") ||
    pickFuzzy(row, /telefonofisso/, /^telefono$/, /^tel$/);

  return {
    id: pick(row, "ID", "Id", "id", "Codice", "Codice cliente", "sourceId") || undefined,
    ragioneSociale: buildRagioneSociale(row),
    indirizzo: pick(row, "Indirizzo", "Via", "Indirizzo completo") || pickFuzzy(row, /indirizzo/, /^via$/),
    cap: pick(row, "CAP", "Cap", "cap") || pickFuzzy(row, /^cap$/),
    citta,
    provincia,
    telFisso: telFisso || undefined,
    cellulare: cellulare || telFisso || undefined,
    email: pick(row, "Email", "E-mail", "Mail") || pickFuzzy(row, /^email$/, /^mail$/),
    note1: pick(row, "Note 1", "Note1", "Note") || undefined,
    note2: pick(row, "Note 2", "Note2") || undefined,
    note3: pick(row, "Note 3", "Note3") || undefined,
    statoAnagrafica: pick(row, "Stato", "Esito", "Controllo") || undefined,
    motivoControllo: pick(row, "Motivo controllo", "Motivo", "Errore") || undefined,
  };
}

function getSheetRows(sheet: XLSX.WorkSheet): { rows: Record<string, unknown>[]; headers: string[] } {
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
    blankrows: false,
  });

  if (matrix.length === 0) return { rows: [], headers: [] };

  let headerIdx = 0;
  for (let i = 0; i < Math.min(15, matrix.length); i++) {
    const cells = matrix[i].map((cell) => normalizeKey(String(cell ?? "")));
    if (cells.some((c) => /^(cognome|nome|ragione|cliente|comune|citta|cellulare|telefono|id)$/.test(c) || /ragionesociale/.test(c))) {
      headerIdx = i;
      break;
    }
  }

  const headers = matrix[headerIdx].map((cell) => String(cell ?? "").trim());
  const rows: Record<string, unknown>[] = [];

  for (const cells of matrix.slice(headerIdx + 1)) {
    const row: Record<string, unknown> = {};
    let hasValue = false;
    headers.forEach((header, idx) => {
      if (!header) return;
      const value = cells[idx];
      if (value !== "" && value != null) hasValue = true;
      row[header] = value;
    });
    if (hasValue) rows.push(row);
  }

  return { rows, headers: headers.filter(Boolean) };
}

function findSheet(sheetNames: string[], matcher: (name: string) => boolean): string | undefined {
  return sheetNames.find(matcher);
}

function isSintesiRow(row: Record<string, unknown>): boolean {
  const hasClientData =
    !!buildRagioneSociale(row) ||
    !!pick(row, "Cognome", "COGNOME", "cognome", "Nome", "NOME", "nome") ||
    !!pick(row, "Cellulare", "Telefono", "Comune", "Città", "Citta") ||
    !!pickFuzzy(row, /cellulare/, /^comune$/, /^citta$/);

  if (hasClientData) return false;

  const label = pick(row, "Stato", "Controllo", "Risultato", "Categoria", "Tipo").toLowerCase();
  return /^(totali?|ok|ko|da rivedere|duplicati)$/.test(label);
}

function classifyStato(stato?: string): "ok" | "ko" | "rivedere" | "unknown" {
  const s = (stato ?? "").trim().toLowerCase();
  if (!s) return "ok";
  if (/^ko$|errore|non valido|scartat/.test(s)) return "ko";
  if (/rivedere|duplicat/.test(s)) return "rivedere";
  if (/^ok$|valido|import/.test(s)) return "ok";
  return "unknown";
}

export interface ParseResult {
  ok: ClienteRow[];
  ko: { row: Record<string, unknown>; motivo: string }[];
  duplicati: { gruppoId: string; records: ClienteRow[] }[];
  headers: string[];
  stats: {
    totalRows: number;
    skippedSintesi: number;
    skippedRivedere: number;
  };
}

export function parseXlsx(buffer: Buffer): ParseResult {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const { SheetNames } = workbook;

  const sheetClienti = findSheet(SheetNames, (n) => /^clienti$/i.test(n.trim()));
  const sheetDuplicati = findSheet(SheetNames, (n) =>
    /duplicati.*rivedere|rivedere.*duplicati/i.test(n.trim())
  );

  const ok: ClienteRow[] = [];
  const ko: { row: Record<string, unknown>; motivo: string }[] = [];

  if (!sheetClienti) {
    throw new Error(
      `Foglio "Clienti" non trovato. Fogli presenti: ${SheetNames.join(", ")}`
    );
  }

  const { rows: clientiRows, headers } = getSheetRows(workbook.Sheets[sheetClienti]);
  let skippedSintesi = 0;
  let skippedRivedere = 0;

  for (const row of clientiRows) {
    if (isSintesiRow(row)) {
      skippedSintesi++;
      continue;
    }

    const mapped = mapRow(row);
    const stato = classifyStato(mapped.statoAnagrafica);

    if (!mapped.ragioneSociale) {
      ko.push({ row, motivo: "Nome / ragione sociale mancante o non valido" });
      continue;
    }

    if (stato === "ko") {
      ko.push({
        row,
        motivo: mapped.motivoControllo || mapped.statoAnagrafica || "Record KO",
      });
      continue;
    }

    if (stato === "rivedere") {
      skippedRivedere++;
      continue;
    }

    ok.push(mapped);
  }

  const duplicati: { gruppoId: string; records: ClienteRow[] }[] = [];
  if (sheetDuplicati) {
    const { rows } = getSheetRows(workbook.Sheets[sheetDuplicati]);

    const groups = new Map<string, ClienteRow[]>();
    for (const row of rows) {
      if (isSintesiRow(row)) continue;

      const mapped = mapRow(row);
      if (!mapped.ragioneSociale) continue;

      const gruppoKey =
        pick(row, "Gruppo", "gruppoId", "Gruppo ID") ||
        mapped.ragioneSociale.toLowerCase().replace(/\s+/g, " ").trim();

      if (!groups.has(gruppoKey)) groups.set(gruppoKey, []);
      groups.get(gruppoKey)!.push(mapped);
    }

    let gIdx = 0;
    for (const [gruppoKey, records] of groups) {
      duplicati.push({ gruppoId: `dup-${++gIdx}-${gruppoKey.slice(0, 20)}`, records });
    }
  }

  return { ok, ko, duplicati, headers, stats: {
    totalRows: clientiRows.length,
    skippedSintesi,
    skippedRivedere,
  } };
}

export function normalizePhone(phone?: string): string {
  if (!phone) return "";
  return phone.replace(/\D/g, "").replace(/^39/, "");
}
