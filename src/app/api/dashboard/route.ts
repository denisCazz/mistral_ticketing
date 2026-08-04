import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { preventivoWhereForSession } from "@/lib/access";
import { prisma } from "@/lib/db";
import { giorniFinoScadenza } from "@/lib/scadenza-parser";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const preventivoWhere = preventivoWhereForSession(session);
  const isOperatore = session.user?.role === "OPERATORE";

  const scadenzaWhere: Record<string, unknown> = {
    confermata: true,
    dataScadenza: { gte: new Date() },
  };
  if (isOperatore) {
    scadenzaWhere.responsabileId = session.user!.id!;
  }

  const scadenze = await prisma.scadenza.findMany({
    where: scadenzaWhere,
    select: { dataScadenza: true },
  });

  let scadenzeProssime = 0;
  let scadenzeUrgenti = 0;
  for (const s of scadenze) {
    const g = giorniFinoScadenza(s.dataScadenza);
    if (g <= 30) scadenzeProssime++;
    if (g <= 7) scadenzeUrgenti++;
  }

  const [perStato, preventivi, totaleClienti] = await Promise.all([
    prisma.preventivo.groupBy({
      by: ["stato"],
      where: preventivoWhere,
      _count: { stato: true },
    }),
    prisma.preventivo.findMany({
      where: preventivoWhere,
      take: 10,
      orderBy: { updatedAt: "desc" },
      include: {
        cliente: { select: { id: true, ragioneSociale: true } },
        operatore: { select: { id: true, name: true } },
      },
    }),
    isOperatore ? Promise.resolve(0) : prisma.cliente.count(),
  ]);

  return NextResponse.json({
    perStato,
    preventivi,
    totaleClienti,
    scadenzeProssime,
    scadenzeUrgenti,
  });
}
