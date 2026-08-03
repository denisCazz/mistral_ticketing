import * as XLSX from "xlsx";
import { prisma } from "@/lib/db";

// ABBOZZO import CAT. Colonne attese (flessibili): Ragione sociale, Email, Referente,
// Telefono, Indirizzo, CAP, Città, Provincia, Note. Foglio: primo o "CAT".

export interface CatRow {
  ragioneSociale: string;
  emails: string[];
  referenti?: string[];
  telefono?: string;
  indirizzo?: string;
  cap?: string;
  citta?: string;
  provincia?: string;
  note?: string;
  sourceId?: string;
}

const INVALID = /^(#NOME\?|#N\/A|n\.?\/?a\.?|null|undefined|-)$/i;

function splitList(raw: string): string[] {
  if (!raw) return [];
  return raw
    .split(/[,;|/]|\n/)
    .map((s) => s.trim())
    .filter((s) => s && !INVALID.test(s));
}

function parseReferenti(raw: string): string[] {
  return splitList(raw);
}

function parseEmails(raw: string): string[] {
  // Dedup mantenendo l'ordine, tutte in minuscolo.
  const seen = new Set<string>();
  const out: string[] = [];
  for (const e of splitList(raw)) {
    const email = e.toLowerCase();
    if (!seen.has(email)) {
      seen.add(email);
      out.push(email);
    }
  }
  return out;
}

function pick(row: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = String(row[k] ?? "").trim();
    if (v && !INVALID.test(v)) return v;
  }
  return "";
}

// Concatena i valori di tutte le colonne indicate (utile quando le email sono
// spalmate su più colonne, es. "Email 1", "Email 2", ...).
function pickAll(row: Record<string, unknown>, ...keys: string[]): string {
  const parts: string[] = [];
  for (const k of keys) {
    const v = String(row[k] ?? "").trim();
    if (v && !INVALID.test(v)) parts.push(v);
  }
  return parts.join(";");
}

function mapRow(row: Record<string, unknown>): CatRow {
  return {
    sourceId: pick(row, "ID", "Id", "Codice") || undefined,
    ragioneSociale: pick(row, "Ragione sociale", "RagioneSociale", "Nome", "CAT", "Centro assistenza", "Denominazione"),
    emails: parseEmails(
      pickAll(row, "Email", "E-mail", "Mail", "Emails", "Email 1", "Email1", "Email 2", "Email2", "Email 3", "Email3")
    ),
    referenti: parseReferenti(pick(row, "Referente", "Contatto", "Referenti")),
    telefono: pick(row, "Telefono", "Tel", "Cellulare") || undefined,
    indirizzo: pick(row, "Indirizzo", "Via") || undefined,
    cap: pick(row, "CAP", "Cap") || undefined,
    citta: pick(row, "Città", "Citta", "Comune") || undefined,
    provincia: pick(row, "Provincia", "Prov") || undefined,
    note: pick(row, "Note", "Note 1") || undefined,
  };
}

export interface CatParseResult {
  ok: CatRow[];
  ko: { motivo: string }[];
  headers: string[];
}

export function parseCatXlsx(buffer: Buffer): CatParseResult {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const sheetName = wb.SheetNames.find((n) => /cat/i.test(n)) ?? wb.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[sheetName]);

  const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
  const ok: CatRow[] = [];
  const ko: { motivo: string }[] = [];

  for (const row of rows) {
    const mapped = mapRow(row);
    if (!mapped.ragioneSociale) {
      ko.push({ motivo: "Ragione sociale mancante" });
      continue;
    }
    if (mapped.emails.length === 0) {
      ko.push({ motivo: `${mapped.ragioneSociale}: email mancante` });
      continue;
    }
    ok.push(mapped);
  }

  return { ok, ko, headers };
}

export async function upsertCat(row: CatRow): Promise<"created" | "updated"> {
  const existing =
    (row.sourceId
      ? await prisma.cat.findFirst({ where: { sourceId: row.sourceId } })
      : null) ??
    (await prisma.cat.findFirst({
      where: { emails: { hasSome: row.emails } },
    }));

  const data = {
    ragioneSociale: row.ragioneSociale,
    emails: row.emails,
    referenti: row.referenti ?? [],
    telefono: row.telefono,
    indirizzo: row.indirizzo,
    cap: row.cap,
    citta: row.citta,
    provincia: row.provincia,
    note: row.note,
    sourceId: row.sourceId,
  };

  if (existing) {
    await prisma.cat.update({ where: { id: existing.id }, data });
    return "updated";
  }
  await prisma.cat.create({ data });
  return "created";
}
