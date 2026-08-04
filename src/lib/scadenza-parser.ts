import type { FonteScadenza, StatoValidita } from "@prisma/client";

export interface ParsedScadenza {
  dataScadenza: Date | null;
  fonte: FonteScadenza;
  confidence: number;
  rawValue: string | null;
  statoValidita: StatoValidita;
}

const SCAD_PATTERNS = [
  /scad\.?\s*(\d{1,2})\s+(\d{1,2})\s+(\d{2,4})/i,
  /scad\s+(\d{1,2})\s+(\d{1,2})\s+(\d{2,4})/i,
  /scad\.?\s*(\d{2})\.(\d{2})\.(\d{2,4})/i,
  /scad\.?\s*(\d{1,2})\/(\d{1,2})\/(\d{2,4})/i,
];

const DEL_PATTERNS = [
  /del\s+(\d{1,2})\s+(\d{1,2})\s+(\d{2,4})/i,
  /del\s+(\d{1,2})\.(\d{1,2})\.(\d{2,4})/i,
];

function parseParts(day: string, month: string, year: string): Date | null {
  const d = parseInt(day, 10);
  const m = parseInt(month, 10);
  let y = parseInt(year, 10);
  if (y < 100) y += 2000;
  if (d < 1 || d > 31 || m < 1 || m > 12 || y < 1990 || y > 2100) return null;
  const date = new Date(y, m - 1, d);
  if (
    date.getFullYear() !== y ||
    date.getMonth() !== m - 1 ||
    date.getDate() !== d
  ) {
    return null;
  }
  return date;
}

function matchPatterns(
  text: string,
  patterns: RegExp[],
  confidence: number
): ParsedScadenza | null {
  for (const pattern of patterns) {
    const m = text.match(pattern);
    if (m) {
      const date = parseParts(m[1], m[2], m[3]);
      if (date) {
        return {
          dataScadenza: date,
          fonte: "FILENAME",
          confidence,
          rawValue: m[0],
          statoValidita: "VALIDO",
        };
      }
    }
  }
  return null;
}

export function parseScadenzaFromText(
  text: string,
  folderPath?: string
): ParsedScadenza {
  const combined = `${folderPath ?? ""} ${text}`.trim();

  if (/scadut/i.test(combined)) {
    return {
      dataScadenza: null,
      fonte: "FOLDER",
      confidence: 0.9,
      rawValue: "scaduto",
      statoValidita: "SCADUTO",
    };
  }

  const scad = matchPatterns(combined, SCAD_PATTERNS, 0.85);
  if (scad) return scad;

  const del = matchPatterns(combined, DEL_PATTERNS, 0.6);
  if (del) {
    del.fonte = "FILENAME";
    return del;
  }

  const idoneita = combined.match(
    /IdoneitaDatore_(\d{1,2})_(\d{1,2})_(\d{2,4})/i
  );
  if (idoneita) {
    const date = parseParts(idoneita[1], idoneita[2], idoneita[3]);
    if (date) {
      return {
        dataScadenza: date,
        fonte: "FILENAME",
        confidence: 0.8,
        rawValue: idoneita[0],
        statoValidita: "VALIDO",
      };
    }
  }

  return {
    dataScadenza: null,
    fonte: "MANUALE",
    confidence: 0,
    rawValue: null,
    statoValidita: "DA_REVISIONARE",
  };
}

export function giorniFinoScadenza(data: Date): number {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(data.getFullYear(), data.getMonth(), data.getDate());
  return Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}
