import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const catId = session.user?.catId;
  const isManutentore = session.user?.role === "MANUTENTORE";
  // Un utente collegato a un CAT vede solo le pratiche di quel CAT.
  const praticaWhere = catId
    ? { catId }
    : isManutentore
    ? { manutentoreId: session.user!.id! }
    : {};

  const [perStato, pratiche, totaleClienti, totaleRapportini] = await Promise.all([
    prisma.pratica.groupBy({
      by: ["stato"],
      where: praticaWhere,
      _count: { stato: true },
    }),
    prisma.pratica.findMany({
      where: praticaWhere,
      take: 10,
      orderBy: { updatedAt: "desc" },
      include: {
        cliente: { select: { id: true, ragioneSociale: true } },
        operatore: { select: { id: true, name: true } },
        cat: { select: { id: true, ragioneSociale: true } },
      },
    }),
    isManutentore || catId ? Promise.resolve(0) : prisma.cliente.count(),
    prisma.rapportino.count({
      where:
        session.user?.role === "ADMIN"
          ? {}
          : { utenteId: session.user!.id! },
    }),
  ]);

  return NextResponse.json({ perStato, pratiche, totaleClienti, totaleRapportini });
}
