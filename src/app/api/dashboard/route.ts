import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { preventivoWhereForSession } from "@/lib/access";
import { prisma } from "@/lib/db";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const preventivoWhere = preventivoWhereForSession(session);
    const isOperatore = session.user?.role === "OPERATORE";

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOf30Days = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + 30,
      23,
      59,
      59,
      999
    );
    const endOf7Days = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + 7,
      23,
      59,
      59,
      999
    );

    const scadenzaBase: Record<string, unknown> = { confermata: true };
    if (isOperatore) {
      scadenzaBase.responsabileId = session.user!.id!;
    }

    const [scadenzeProssime, scadenzeUrgenti, perStato, preventivi, totaleClienti] =
      await Promise.all([
        prisma.scadenza.count({
          where: {
            ...scadenzaBase,
            dataScadenza: { gte: startOfToday, lte: endOf30Days },
          },
        }),
        prisma.scadenza.count({
          where: {
            ...scadenzaBase,
            dataScadenza: { gte: startOfToday, lte: endOf7Days },
          },
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
