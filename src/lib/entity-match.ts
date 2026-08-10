/** Matching fuzzy di dipendenti e targhe su testo estratto. */

export function normalizePersonToken(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function normalizeTarga(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export type DipendenteCandidate = {
  id: string;
  nome: string;
  cognome: string;
};

export type AutomezzoCandidate = {
  id: string;
  targa: string;
};

export type EntityMatchResult = {
  dipendenteId: string | null;
  automezzoId: string | null;
  dipendenteScore: number;
  automezzoScore: number;
  dipendenteLabel: string | null;
  automezzoLabel: string | null;
  ambiguousDipendente: boolean;
  ambiguousAutomezzo: boolean;
};

function scorePerson(
  candidate: DipendenteCandidate,
  nome: string | null | undefined,
  cognome: string | null | undefined,
  haystack: string
): number {
  const cNome = normalizePersonToken(candidate.nome);
  const cCognome = normalizePersonToken(candidate.cognome);
  const full = normalizePersonToken(`${candidate.nome} ${candidate.cognome}`);
  const rev = normalizePersonToken(`${candidate.cognome} ${candidate.nome}`);
  const n = nome ? normalizePersonToken(nome) : "";
  const c = cognome ? normalizePersonToken(cognome) : "";
  const hay = normalizePersonToken(haystack);

  let score = 0;
  if (n && cNome === n) score += 0.45;
  if (c && cCognome === c) score += 0.45;
  if (n && c && full === `${n} ${c}`) score = Math.max(score, 0.98);
  if (n && c && rev === `${n} ${c}`) score = Math.max(score, 0.95);
  if (full && hay.includes(full)) score = Math.max(score, 0.92);
  if (rev && hay.includes(rev)) score = Math.max(score, 0.9);
  if (cCognome.length >= 3 && hay.includes(cCognome)) score = Math.max(score, 0.55);
  return Math.min(1, score);
}

export function matchEntities(params: {
  personaNome?: string | null;
  personaCognome?: string | null;
  targa?: string | null;
  haystack?: string;
  dipendenti: DipendenteCandidate[];
  automezzi: AutomezzoCandidate[];
  minScore?: number;
}): EntityMatchResult {
  const minScore = params.minScore ?? 0.85;
  const haystack = params.haystack ?? "";

  const rankedPeople = params.dipendenti
    .map((d) => ({
      d,
      score: scorePerson(d, params.personaNome, params.personaCognome, haystack),
    }))
    .filter((x) => x.score >= minScore)
    .sort((a, b) => b.score - a.score);

  const topPeople = rankedPeople[0];
  const secondPeople = rankedPeople[1];
  const ambiguousDipendente = Boolean(
    topPeople && secondPeople && topPeople.score - secondPeople.score < 0.08
  );

  const wantTarga = params.targa ? normalizeTarga(params.targa) : "";
  const hayTarga = normalizeTarga(haystack);
  const rankedVehicles = params.automezzi
    .map((a) => {
      const t = normalizeTarga(a.targa);
      let score = 0;
      if (wantTarga && t === wantTarga) score = 1;
      else if (t.length >= 5 && hayTarga.includes(t)) score = 0.95;
      return { a, score };
    })
    .filter((x) => x.score >= minScore)
    .sort((a, b) => b.score - a.score);

  const topVehicle = rankedVehicles[0];
  const secondVehicle = rankedVehicles[1];
  const ambiguousAutomezzo = Boolean(
    topVehicle && secondVehicle && topVehicle.score - secondVehicle.score < 0.05
  );

  return {
    dipendenteId:
      topPeople && !ambiguousDipendente ? topPeople.d.id : null,
    automezzoId:
      topVehicle && !ambiguousAutomezzo ? topVehicle.a.id : null,
    dipendenteScore: topPeople?.score ?? 0,
    automezzoScore: topVehicle?.score ?? 0,
    dipendenteLabel: topPeople
      ? `${topPeople.d.nome} ${topPeople.d.cognome}`
      : null,
    automezzoLabel: topVehicle?.a.targa ?? null,
    ambiguousDipendente,
    ambiguousAutomezzo,
  };
}
