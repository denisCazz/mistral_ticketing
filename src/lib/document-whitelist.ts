/** Categorie escluse dal RAG AI (HR, identità, fiscale). */
const BLOCKED_KEYWORDS = [
  "unilav",
  "idoneita",
  "idoneità",
  "ci ",
  "carta ident",
  "patente",
  "tessera sanitaria",
  "f24",
  "durc",
  "durf",
  "visure",
  "licenziati",
  "archivio licenziati",
  "fototessera",
  "foto",
  "consegna dpi",
];

/** Categorie incluse nel RAG se esplicitamente whitelist. */
const ALLOWED_CATEGORIES = [
  "formazione",
  "antincendio",
  "ple",
  "pes",
  "pav",
  "preposto",
  "rspp",
  "rls",
  "fgas",
  "termografia",
  "sicurezza",
  "attestato",
  "assicurazioni",
  "libretti",
];

export function isAiWhitelistCandidate(
  categoria: string,
  sottocategoria?: string | null,
  pathHint?: string | null
): boolean {
  const haystack = [
    categoria,
    sottocategoria ?? "",
    pathHint ?? "",
  ]
    .join(" ")
    .toLowerCase();

  if (BLOCKED_KEYWORDS.some((k) => haystack.includes(k))) {
    return false;
  }

  return ALLOWED_CATEGORIES.some((k) => haystack.includes(k));
}

export function classifyCategoriaFromPath(parts: string[]): {
  categoria: string;
  sottocategoria?: string;
  entityType: "DIPENDENTE" | "AUTOMEZZO" | "AZIENDA";
} {
  const top = parts[0]?.toUpperCase() ?? "AZIENDA";

  if (top.includes("AUTOMEZZI")) {
    const sub = parts[1] ?? "GENERALE";
    return { categoria: sub, sottocategoria: parts[2], entityType: "AUTOMEZZO" };
  }

  if (top.includes("DIPENDENTI")) {
    const sub = parts[2] ?? parts[1] ?? "GENERALE";
    return {
      categoria: sub,
      sottocategoria: parts[3],
      entityType: "DIPENDENTE",
    };
  }

  return {
    categoria: top,
    sottocategoria: parts[1],
    entityType: "AZIENDA",
  };
}

export const SKIP_FILE_NAMES = new Set([
  "thumbs.db",
  ".ds_store",
]);

/** Archivi compressi: non importare (vogliamo i file già estratti). */
const SKIP_EXTENSIONS = new Set([
  ".zip",
  ".rar",
  ".7z",
  ".tar",
  ".gz",
  ".tgz",
  ".bz2",
]);

export function shouldSkipFile(name: string): boolean {
  const lower = name.toLowerCase();
  if (SKIP_FILE_NAMES.has(lower)) return true;
  if (lower.startsWith("~$")) return true;
  if (lower.endsWith(".db")) return true;
  const ext = lower.includes(".") ? lower.slice(lower.lastIndexOf(".")) : "";
  if (SKIP_EXTENSIONS.has(ext)) return true;
  return false;
}
