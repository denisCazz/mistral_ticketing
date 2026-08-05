import "dotenv/config";

import * as XLSX from "xlsx";
import { prisma } from "../src/lib/db";

/**
 * Importa le scadenze di aggiornamento formazione dal foglio HR
 * "Formazione Dipendenti" (XLS). Scadenza = data corso + frequenza
 * di aggiornamento indicata nella riga 2 del foglio.
 *
 * Uso:
 *   npm run import:formazione:dry   # solo anteprima
 *   npm run import:formazione       # scrive nel DB
 */

const FILE =
  "/Users/denis/Library/Containers/com.apple.mail/Data/Library/Mail Downloads/B3D28EE8-CCE1-4C5B-83B2-F6C5A2B3B31A/Formazione Dipendenti 24 07 2026.xls";

const FONTE_SHEET = "Formazione Dipendenti 24 07 2026 (Michela Martini)";

// Colonna -> frequenza aggiornamento in anni (riga 2 del foglio).
// null = corso che non scade (Formazione Generale).
const CORSI: Record<number, { nome: string; aggAnni: number | null }> = {
  1: { nome: "Visita medica", aggAnni: 1 },
  2: { nome: "Primo Soccorso", aggAnni: 3 },
  3: { nome: "Formazione Rischio basso", aggAnni: 5 },
  4: { nome: "Antincendio Rischio Elevato/Medio", aggAnni: 5 },
  5: { nome: "Formazione Generale", aggAnni: null },
  6: { nome: "Formazione Rischio alto", aggAnni: 5 },
  7: { nome: "Formazione Preposto", aggAnni: 2 },
  8: { nome: "Piattaforme Elevabili (PLE)", aggAnni: 5 },
  9: { nome: "Gas Fluorurati (RINA)", aggAnni: 10 },
  10: { nome: "Termografia Infrarossa", aggAnni: 5 },
  11: { nome: "DPI Anticaduta", aggAnni: 5 },
  12: { nome: "PES/PAV", aggAnni: 5 },
  13: { nome: "RSPP", aggAnni: 5 },
  14: { nome: "PETZL Ispezione DPI lavoro in quota", aggAnni: 5 },
  15: { nome: "Manutentore antincendio", aggAnni: 5 },
  16: { nome: "Datore di lavoro", aggAnni: 5 },
  17: { nome: "RLS", aggAnni: 1 },
};

const dryRun = process.argv.includes("--dry-run");

function serialToDate(serial: number): Date | null {
  const parsed = XLSX.SSF.parse_date_code(serial);
  if (!parsed || !parsed.y) return null;
  return new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d));
}

function addYears(date: Date, years: number): Date {
  const d = new Date(date);
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return d;
}

const fmt = (d: Date) => d.toISOString().slice(0, 10);
const fmtIt = (d: Date) =>
  d.toLocaleDateString("it-IT", { timeZone: "UTC" });

interface ScadenzaFormazione {
  dipendenteNome: string;
  corso: string;
  dataCorso: Date;
  dataScadenza: Date;
  aggAnni: number;
}

function leggiFoglio(): ScadenzaFormazione[] {
  const wb = XLSX.readFile(FILE, { cellDates: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    defval: "",
    raw: true,
  });

  const result: ScadenzaFormazione[] = [];
  // Righe 3..24 (0-based) = dipendenti; ultima riga dipendente prima del vuoto
  for (let r = 3; r < rows.length; r++) {
    const row = rows[r] as unknown[];
    const nome = String(row[0] ?? "").trim();
    if (!nome) break; // riga vuota => fine elenco dipendenti

    for (let c = 1; c <= 17; c++) {
      const corso = CORSI[c];
      if (!corso || corso.aggAnni == null) continue;
      const cell = row[c];
      if (typeof cell !== "number") continue; // "", "/", "n" => corso non fatto
      const dataCorso = serialToDate(cell);
      if (!dataCorso) continue;
      result.push({
        dipendenteNome: nome,
        corso: corso.nome,
        dataCorso,
        dataScadenza: addYears(dataCorso, corso.aggAnni),
        aggAnni: corso.aggAnni,
      });
    }
  }
  return result;
}

function costruisciMappaDipendenti(
  dipendenti: { id: string; nome: string; cognome: string }[]
): Map<string, string> {
  const mappa = new Map<string, string>();
  for (const d of dipendenti) {
    const chiave = `${d.nome} ${d.cognome}`.toLowerCase().replace(/\s+/g, " ");
    mappa.set(chiave, d.id);
    mappa.set(
      `${d.cognome} ${d.nome}`.toLowerCase().replace(/\s+/g, " "),
      d.id
    );
  }
  return mappa;
}

async function main() {
  console.log(
    dryRun
      ? "🔍 Anteprima import formazione (nessuna scrittura)"
      : "📥 Import formazione nel DB"
  );

  const scadenze = leggiFoglio();
  console.log(`Scadenze calcolate dal foglio: ${scadenze.length}`);

  const oggi = new Date();
  oggi.setUTCHours(0, 0, 0, 0);

  const future = scadenze.filter((s) => s.dataScadenza >= oggi);
  const passate = scadenze
    .filter((s) => s.dataScadenza < oggi)
    .sort((a, b) => a.dataScadenza.getTime() - b.dataScadenza.getTime());

  console.log(
    `\n⚠️  Già scadute (NON importate, rinnovo da pianificare): ${passate.length}`
  );
  for (const s of passate) {
    console.log(
      `   ${fmt(s.dataScadenza)} · ${s.dipendenteNome} · ${s.corso}`
    );
  }

  const dipendenti = await prisma.dipendente.findMany({
    where: { archiviato: false },
    select: { id: true, nome: true, cognome: true },
  });
  const mappa = costruisciMappaDipendenti(dipendenti);

  const nonTrovati = new Set<string>();
  let create = 0;
  let aggiornate = 0;

  for (const s of future) {
    const chiave = s.dipendenteNome.toLowerCase().replace(/\s+/g, " ");
    const dipendenteId = mappa.get(chiave);
    if (!dipendenteId) {
      nonTrovati.add(s.dipendenteNome);
      continue;
    }

    const titolo = `Aggiornamento ${s.corso}`;
    const descrizione = [
      `${s.dipendenteNome}`,
      `corso svolto il ${fmtIt(s.dataCorso)}`,
      `aggiornamento ogni ${s.aggAnni} ${s.aggAnni === 1 ? "anno" : "anni"}`,
      `fonte: ${FONTE_SHEET}`,
    ].join(" · ");

    if (dryRun) {
      console.log(
        `   ${fmt(s.dataScadenza)} · ${s.dipendenteNome} · ${titolo}`
      );
      continue;
    }

    // Idempotente: una scadenza per (dipendente, corso). Se già esiste
    // (import precedente o inserimento manuale) aggiorna la data.
    const esistente = await prisma.scadenza.findFirst({
      where: { dipendenteId, titolo },
    });
    if (esistente) {
      await prisma.scadenza.update({
        where: { id: esistente.id },
        data: { dataScadenza: s.dataScadenza, descrizione },
      });
      aggiornate++;
    } else {
      await prisma.scadenza.create({
        data: {
          dipendenteId,
          titolo,
          descrizione,
          dataScadenza: s.dataScadenza,
          fonte: "MANUALE",
          confidence: 1,
          rawValue: `corso ${fmt(s.dataCorso)} + ${s.aggAnni}y`,
          confermata: false,
        },
      });
      create++;
    }
  }

  if (nonTrovati.size > 0) {
    console.log(`\n❌ Dipendenti non trovati in anagrafica:`);
    for (const n of nonTrovati) console.log(`   ${n}`);
  }

  if (dryRun) {
    console.log(`\n✅ Anteprima completata: ${future.length} scadenze future`);
    return;
  }

  console.log(
    `\n✅ Import completato: ${create} create, ${aggiornate} aggiornate, ` +
      `${passate.length} già scadute saltate, ${nonTrovati.size} dipendenti non trovati`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
