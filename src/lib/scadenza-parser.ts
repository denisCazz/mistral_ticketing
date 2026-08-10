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
  /scad\.?\s*(\d{1,2})-(\d{1,2})-(\d{2,4})/i,
  /scad\.?\s*(\d{1,2})_(\d{1,2})_(\d{2,4})/i,
];

const FINO_PATTERNS = [
  /fino\s+a[l]?\s+(\d{1,2})[.\-\/_ ](\d{1,2})[.\-\/_ ](\d{2,4})/i,
  /valido\s+fino\s+(?:al\s+)?(\d{1,2})[.\-\/_ ](\d{1,2})[.\-\/_ ](\d{2,4})/i,
  /scadenza\s*(?:al|il|:)?\s*(\d{1,2})[.\-\/_ ](\d{1,2})[.\-\/_ ](\d{2,4})/i,
];

const DEL_PATTERNS = [
  /del\s+(\d{1,2})\s+(\d{1,2})\s+(\d{2,4})/i,
  /del\s+(\d{1,2})\.(\d{1,2})\.(\d{2,4})/i,
];

const MESI: Record<string, number> = {
  gennaio: 1,
  febbraio: 2,
  marzo: 3,
  aprile: 4,
  maggio: 5,
  giugno: 6,
  luglio: 7,
  agosto: 8,
  settembre: 9,
  ottobre: 10,
  novembre: 11,
  dicembre: 12,
};

function parseParts(day: string, month: string, year: string): Date | null {
  const d = parseInt(day, 10);
  const m = parseInt(month, 10);
  let y = parseInt(year, 10);
  if (y < 100) y += 2000;
  if (d < 1 || d > 31 || m < 1 || m > 12 || y < 1990 || y > 2100) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (
    date.getUTCFullYear() !== y ||
    date.getUTCMonth() !== m - 1 ||
    date.getUTCDate() !== d
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

function withStato(
  parsed: ParsedScadenza,
  folderScaduto: boolean
): ParsedScadenza {
  if (!parsed.dataScadenza) {
    return {
      ...parsed,
      statoValidita: folderScaduto ? "SCADUTO" : parsed.statoValidita,
      fonte: folderScaduto && !parsed.rawValue ? "FOLDER" : parsed.fonte,
    };
  }

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const scaduto =
    folderScaduto || parsed.dataScadenza.getTime() < today.getTime();

  return {
    ...parsed,
    statoValidita: scaduto ? "SCADUTO" : "VALIDO",
    fonte: folderScaduto && parsed.fonte === "FILENAME" ? "FILENAME" : parsed.fonte,
  };
}

const BODY_SCAD_PATTERNS = [
  ...SCAD_PATTERNS,
  ...FINO_PATTERNS,
  /data\s+di\s+scadenza\s*[:=]?\s*(\d{1,2})[.\-\/_ ](\d{1,2})[.\-\/_ ](\d{2,4})/i,
  /scade\s+(?:il\s+)?(\d{1,2})[.\-\/_ ](\d{1,2})[.\-\/_ ](\d{2,4})/i,
  /validit[aà]\s+(?:fino\s+)?(?:al\s+)?(\d{1,2})[.\-\/_ ](\d{1,2})[.\-\/_ ](\d{2,4})/i,
  /expir(?:y|es|ation)?\s*[:=]?\s*(\d{1,2})[.\-\/_ ](\d{1,2})[.\-\/_ ](\d{2,4})/i,
];

/**
 * Estrae scadenza da filename/cartella (alta priorità sui pattern espliciti).
 * Per corpo documento usare `parseScadenzaFromBody`.
 */
export function parseScadenzaFromText(
  text: string,
  folderPath?: string
): ParsedScadenza {
  const folder = folderPath ?? "";
  const combined = `${folder} ${text}`.trim();
  const folderScaduto = /scadut/i.test(folder) || /scadut/i.test(text);

  // Cerca prima le date nel titolo: non far bloccare dalla cartella "Scaduto"
  const scad = matchPatterns(combined, SCAD_PATTERNS, 0.85);
  if (scad) return withStato(scad, folderScaduto);

  const fino = matchPatterns(combined, FINO_PATTERNS, 0.85);
  if (fino) return withStato(fino, folderScaduto);

  const idoneita = combined.match(
    /IdoneitaDatore_(\d{1,2})_(\d{1,2})_(\d{2,4})/i
  );
  if (idoneita) {
    const date = parseParts(idoneita[1], idoneita[2], idoneita[3]);
    if (date) {
      return withStato(
        {
          dataScadenza: date,
          fonte: "FILENAME",
          confidence: 0.8,
          rawValue: idoneita[0],
          statoValidita: "VALIDO",
        },
        folderScaduto
      );
    }
  }

  const meseNome = text.match(
    /scadenza\s+(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)\s+(20\d{2})/i
  );
  if (meseNome) {
    const m = MESI[meseNome[1].toLowerCase()];
    const y = parseInt(meseNome[2], 10);
    if (m) {
      return withStato(
        {
          dataScadenza: new Date(Date.UTC(y, m - 1, 1)),
          fonte: "FILENAME",
          confidence: 0.6,
          rawValue: meseNome[0],
          statoValidita: "VALIDO",
        },
        folderScaduto
      );
    }
  }

  const yearOnly = text.match(
    /(?:scad\.?|scadenza|valido\s+fino|fino\s+al)\s*(?:a\s+)?(20\d{2})(?!\d)/i
  );
  if (yearOnly) {
    const y = parseInt(yearOnly[1], 10);
    return withStato(
      {
        dataScadenza: new Date(Date.UTC(y, 11, 31)),
        fonte: "FILENAME",
        confidence: 0.55,
        rawValue: yearOnly[0],
        statoValidita: "VALIDO",
      },
      folderScaduto
    );
  }

  const del = matchPatterns(combined, DEL_PATTERNS, 0.6);
  if (del) return withStato(del, folderScaduto);

  if (folderScaduto) {
    return {
      dataScadenza: null,
      fonte: "FOLDER",
      confidence: 0.9,
      rawValue: "scaduto",
      statoValidita: "SCADUTO",
    };
  }

  return {
    dataScadenza: null,
    fonte: "MANUALE",
    confidence: 0,
    rawValue: null,
    statoValidita: "DA_REVISIONARE",
  };
}

/**
 * Estrae scadenza dal corpo testuale (OCR/testo PDF).
 * Confidence leggermente più bassa del filename esplicito se manca contesto "scad".
 */
export function parseScadenzaFromBody(text: string): ParsedScadenza {
  const sample = text.slice(0, 120_000);
  const body = matchPatterns(sample, BODY_SCAD_PATTERNS, 0.82);
  if (body) {
    return withStato(
      {
        ...body,
        fonte: "OCR",
      },
      /scadut/i.test(sample)
    );
  }

  const meseNome = sample.match(
    /scadenza\s+(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)\s+(20\d{2})/i
  );
  if (meseNome) {
    const m = MESI[meseNome[1].toLowerCase()];
    const y = parseInt(meseNome[2], 10);
    if (m) {
      return withStato(
        {
          dataScadenza: new Date(Date.UTC(y, m - 1, 1)),
          fonte: "OCR",
          confidence: 0.58,
          rawValue: meseNome[0],
          statoValidita: "VALIDO",
        },
        false
      );
    }
  }

  return {
    dataScadenza: null,
    fonte: "OCR",
    confidence: 0,
    rawValue: null,
    statoValidita: "DA_REVISIONARE",
  };
}

/** Sceglie la migliore tra più proposte scadenza (confidence + presenza data). */
export function pickBestScadenza(
  ...candidates: ParsedScadenza[]
): ParsedScadenza {
  const withDate = candidates.filter((c) => c.dataScadenza);
  if (withDate.length === 0) {
    return (
      candidates.sort((a, b) => b.confidence - a.confidence)[0] ?? {
        dataScadenza: null,
        fonte: "MANUALE",
        confidence: 0,
        rawValue: null,
        statoValidita: "DA_REVISIONARE",
      }
    );
  }
  return withDate.sort((a, b) => b.confidence - a.confidence)[0];
}

export function giorniFinoScadenza(data: Date): number {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(data.getFullYear(), data.getMonth(), data.getDate());
  return Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}
