import { prisma } from "@/lib/db";

export type ListClientiParams = {
  search?: string;
  page?: number;
  limit?: number;
};

export async function listClienti(params: ListClientiParams = {}) {
  const search = params.search?.trim() ?? "";
  const page = Math.max(1, params.page ?? 1);
  const limitParam = params.limit ?? 20;
  const limit = Number.isFinite(limitParam)
    ? Math.min(Math.max(limitParam, 1), 200)
    : 20;
  const skip = (page - 1) * limit;

  const where = search
    ? {
        OR: [
          { ragioneSociale: { contains: search, mode: "insensitive" as const } },
          { cellulare: { contains: search, mode: "insensitive" as const } },
          { telFisso: { contains: search, mode: "insensitive" as const } },
          { email: { contains: search, mode: "insensitive" as const } },
          { citta: { contains: search, mode: "insensitive" as const } },
        ],
      }
    : {};

  const [clienti, total] = await Promise.all([
    prisma.cliente.findMany({
      where,
      skip,
      take: limit,
      orderBy: { ragioneSociale: "asc" },
      include: { _count: { select: { preventivi: true } } },
    }),
    prisma.cliente.count({ where }),
  ]);

  return {
    clienti,
    total,
    page,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}
