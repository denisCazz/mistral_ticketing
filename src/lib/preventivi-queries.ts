import type { Session } from "next-auth";
import type { StatoPreventivo } from "@prisma/client";
import { preventivoWhereForSession } from "@/lib/access";
import { prisma } from "@/lib/db";

export type ListPreventiviParams = {
  stato?: string | null;
  search?: string | null;
  page?: number;
};

export async function listPreventivi(
  session: Session,
  params: ListPreventiviParams = {}
) {
  const page = Math.max(1, params.page ?? 1);
  const limit = 20;
  const skip = (page - 1) * limit;
  const search = params.search?.trim() || null;
  const stato = (params.stato || null) as StatoPreventivo | null;

  const where: Record<string, unknown> = {
    ...preventivoWhereForSession(session),
  };

  if (stato) where.stato = stato;

  if (search) {
    where.OR = [
      { numeroPreventivo: { contains: search, mode: "insensitive" } },
      {
        cliente: {
          ragioneSociale: { contains: search, mode: "insensitive" },
        },
      },
      { introduzione: { contains: search, mode: "insensitive" } },
    ];
  }

  const [preventivi, total] = await Promise.all([
    prisma.preventivo.findMany({
      where,
      skip,
      take: limit,
      orderBy: { updatedAt: "desc" },
      include: {
        cliente: { select: { id: true, ragioneSociale: true } },
        operatore: { select: { id: true, name: true } },
      },
    }),
    prisma.preventivo.count({ where }),
  ]);

  return {
    preventivi,
    total,
    page,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}
