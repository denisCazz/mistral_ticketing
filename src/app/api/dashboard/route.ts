import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { preventivoWhereForSession } from "@/lib/access";
import { prisma } from "@/lib/db";
import { giorniFinoScadenza } from "@/lib/scadenza-parser";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const preventivoWhere = preventivoWhereForSession(session);
    const isOperatore = session.user?.role === "OPERATORE";

    const now = new Date();
    const in30Days = new Date(now);
    in30Days.setDate(in30Days.getDate() + 30);
    const in7Days = new Date(now);
    in7Days.setDate(in7Days.getDate() + 7);

    const scadenzaWhere: Record<string, unknown> = {
      confermata: true,
      dataScadenza: { gte: now, lte: in30Days },
    };
    if (isOperatore) {
      scadenzaWhere.responsabileId = session.user!.id!;
    }

    const [scadenze, perStato, preventivi, totaleClienti] = await Promise.all([
      prisma.scadenza.findMany({
        where: scadenzaWhere,
        select: { dataScadenza: true },
      }),
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

    let scadenzeProssime = 0;
    let scadenzeUrgenti = 0;
    for (const s of scadenze) {
      const g = giorniFinoScadenza(s.dataScadenza);
      if (g <= 30) scadenzeProssime++;
      if (g <= 7) scadenzeUrgenti++;
    }
    // in7Days kept for potential DB-side filter later
    void in7Days;

    return NextResponse.json({
      perStato,
      preventivi,
      totaleClienti,
      scadenzeProssime,
      scadenzeUrgenti,
    });
  } catch (error) {
    console.error("[dashboard]", error);
    return NextResponse.json(
      { error: "Impossibile caricare la dashboard" },
      { status: 500 }
    );
  }
}
