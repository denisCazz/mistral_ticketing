import { normalizePersonToken } from "@/lib/entity-match";

const SYNONYMS: Array<{ match: RegExp; extra: string[] }> = [
  {
    match: /assicuraz|polizza|rc[\s\-]*auto/i,
    extra: ["polizza", "scadenza", "assicurazione"],
  },
  { match: /librett/i, extra: ["libretto", "circolazione"] },
  { match: /scadenz|quando scade|fino al/i, extra: ["scadenza", "validita"] },
  {
    match: /estintor|antincendio|idrante|sprinkler/i,
    extra: ["antincendio", "manutenzione"],
  },
  { match: /\bple\b|piattaform/i, extra: ["PLE", "piattaforma"] },
  { match: /unilav|assunzion/i, extra: ["UNILAV"] },
  { match: /durc|regolarita contribut/i, extra: ["DURC"] },
  { match: /idoneit/i, extra: ["idoneita", "visita"] },
];

const CATEGORY_INTENTS: Array<{ match: RegExp; categoria: string }> = [
  { match: /assicuraz|polizza|rc[\s\-]*auto/i, categoria: "ASSICURAZIONI" },
  { match: /librett/i, categoria: "LIBRETTI" },
  { match: /\bdurc\b/i, categoria: "DURC" },
  { match: /\bdurf\b/i, categoria: "DURF" },
  { match: /\bunilav\b/i, categoria: "UNILAV" },
  { match: /idoneit/i, categoria: "IDONEITA" },
  { match: /\bple\b|piattaform/i, categoria: "PLE" },
  { match: /formazion|attestato/i, categoria: "FORMAZIONE" },
  { match: /antincendio|estintor/i, categoria: "ANTINCENDIO" },
];

export function expandSearchQuery(query: string): string {
  const extras = new Set<string>();
  for (const rule of SYNONYMS) {
    if (rule.match.test(query)) {
      for (const term of rule.extra) extras.add(term);
    }
  }
  if (extras.size === 0) return query.trim();
  const original = new Set(
    query
      .toLocaleLowerCase("it")
      .split(/\s+/)
      .filter(Boolean)
  );
  const suffix = [...extras].filter((term) => !original.has(term.toLowerCase()));
  return suffix.length ? `${query.trim()} ${suffix.join(" ")}` : query.trim();
}

export function lexicalSearchQuery(query: string): string {
  return expandSearchQuery(query)
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function inferCategorieFromQuery(query: string): string[] {
  return CATEGORY_INTENTS.filter((rule) => rule.match.test(query)).map(
    (rule) => rule.categoria
  );
}

export function matchClienteFromQuery(
  query: string,
  clienti: Array<{ id: string; ragioneSociale: string }>
): { id: string; label: string } | null {
  const hay = normalizePersonToken(query);
  if (hay.length < 4) return null;
  let best: { id: string; label: string; length: number } | null = null;
  for (const cliente of clienti) {
    const name = normalizePersonToken(cliente.ragioneSociale);
    if (name.length < 5) continue;
    if (!hay.includes(name)) continue;
    if (!best || name.length > best.length) {
      best = {
        id: cliente.id,
        label: cliente.ragioneSociale,
        length: name.length,
      };
    }
  }
  return best ? { id: best.id, label: best.label } : null;
}
