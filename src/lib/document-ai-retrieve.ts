import { prisma } from "@/lib/db";
import { matchEntities } from "@/lib/entity-match";
import {
  inferCategorieFromQuery,
  lexicalSearchQuery,
  matchClienteFromQuery,
} from "@/lib/document-query-intent";
import {
  searchDocumentChunks,
  type DocumentSearchChunk,
  type DocumentSearchFilters,
  type DocumentSearchScope,
} from "@/lib/document-retrieval";

export type ResolvedAiEntities = {
  dipendenteId: string | null;
  automezzoId: string | null;
  clienteId: string | null;
  dipendenteLabel: string | null;
  automezzoLabel: string | null;
  clienteLabel: string | null;
  categorie: string[];
};

export type AiRetrievalResult = {
  chunks: DocumentSearchChunk[];
  mode: "pgvector" | "json";
  lexicalQuery: string;
  entities: ResolvedAiEntities;
  usedFilters: boolean;
};

async function loadDirectories() {
  const [dipendenti, automezzi, clienti] = await Promise.all([
    prisma.dipendente.findMany({
      where: { active: true },
      select: { id: true, nome: true, cognome: true },
    }),
    prisma.automezzo.findMany({
      select: { id: true, targa: true },
    }),
    prisma.cliente.findMany({
      select: { id: true, ragioneSociale: true },
      take: 500,
      orderBy: { updatedAt: "desc" },
    }),
  ]);
  return { dipendenti, automezzi, clienti };
}

export async function resolveAiEntities(
  query: string,
  hintedClienteId?: string | null
): Promise<ResolvedAiEntities> {
  const { dipendenti, automezzi, clienti } = await loadDirectories();
  const matched = matchEntities({
    haystack: query,
    dipendenti,
    automezzi,
    minScore: 0.85,
  });
  const hintedCliente = hintedClienteId
    ? clienti.find((cliente) => cliente.id === hintedClienteId)
    : null;
  const matchedCliente = hintedCliente
    ? { id: hintedCliente.id, label: hintedCliente.ragioneSociale }
    : matchClienteFromQuery(query, clienti);

  return {
    dipendenteId: matched.dipendenteId,
    automezzoId: matched.automezzoId,
    clienteId: matchedCliente?.id ?? null,
    dipendenteLabel: matched.dipendenteLabel,
    automezzoLabel: matched.automezzoLabel,
    clienteLabel: matchedCliente?.label ?? null,
    categorie: inferCategorieFromQuery(query),
  };
}

function filtersFromEntities(
  entities: ResolvedAiEntities
): DocumentSearchFilters | undefined {
  const filters: DocumentSearchFilters = {};
  if (entities.dipendenteId) filters.dipendenteId = entities.dipendenteId;
  if (entities.automezzoId) filters.automezzoId = entities.automezzoId;
  if (entities.categorie.length) filters.categorie = entities.categorie;
  if (!filters.dipendenteId && !filters.automezzoId && !filters.categorie) {
    return undefined;
  }
  return filters;
}

export function entityContextLine(entities: ResolvedAiEntities): string | null {
  const bits = [
    entities.clienteLabel ? `cliente ${entities.clienteLabel}` : null,
    entities.automezzoLabel ? `automezzo ${entities.automezzoLabel}` : null,
    entities.dipendenteLabel ? `dipendente ${entities.dipendenteLabel}` : null,
  ].filter(Boolean);
  return bits.length ? `Contesto risolto: ${bits.join("; ")}.` : null;
}

export async function retrieveForAi(params: {
  query: string;
  embedding: number[];
  limit: number;
  scope: DocumentSearchScope;
  clienteId?: string | null;
}): Promise<AiRetrievalResult> {
  const entities = await resolveAiEntities(params.query, params.clienteId);
  const lexicalQuery = [
    lexicalSearchQuery(params.query),
    entities.clienteLabel,
    entities.automezzoLabel,
    entities.dipendenteLabel,
  ]
    .filter(Boolean)
    .join(" ")
    .trim();

  const filters = filtersFromEntities(entities);
  const search = (activeFilters?: DocumentSearchFilters) =>
    searchDocumentChunks({
      embedding: params.embedding,
      query: lexicalQuery || params.query,
      limit: params.limit,
      scope: params.scope,
      filters: activeFilters,
    });

  let result = await search(filters);
  let usedFilters = Boolean(filters);
  if (filters && result.chunks.length < 2) {
    result = await search(undefined);
    usedFilters = false;
  }

  return {
    chunks: result.chunks,
    mode: result.mode,
    lexicalQuery,
    entities,
    usedFilters,
  };
}
