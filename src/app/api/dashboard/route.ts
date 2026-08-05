import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { preventivoWhereForSession } from "@/lib/access";
import { prisma } from "@/lib/db";
import { giorniFinoScadenza } from "@/lib/scadenza-parser";
import { toNum } from "@/lib/magazzino";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const preventivoWhere = preventivoWhereForSession(session);
    const isOperatore = session.user?.role === "OPERATORE";
    const userId = session.user!.id!;

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOf7Days = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + 7,
      23,
      59,
      59,
      999
    );
    // Orizzonte max dashboard: niente alert oltre 90 giorni
    const endOf90Days = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + 90,
      23,
      59,
      59,
      999
    );
    const startOf90DaysAgo = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() - 90
    );

    const scadenzaBase: Record<string, unknown> = { confermata: true };
    if (isOperatore) {
      scadenzaBase.responsabileId = userId;
    }

    const [
      scadenzeProssime,
      scadenzeUrgenti,
      scadenzeScadute,
      scadenzeLista,
      perStato,
      preventivi,
      valoreAperti,
      totaleClienti,
      documentiDaClassificare,
      magazzinoSottoSoglia,
      magazzinoAlert,
    ] = await Promise.all([
      prisma.scadenza.count({
        where: {
          ...scadenzaBase,
          dataScadenza: { gte: startOfToday, lte: endOf90Days },
        },
      }),
      prisma.scadenza.count({
        where: {
          ...scadenzaBase,
          dataScadenza: { gte: startOfToday, lte: endOf7Days },
        },
      }),
      prisma.scadenza.count({
        where: {
          ...scadenzaBase,
          dataScadenza: { gte: startOf90DaysAgo, lt: startOfToday },
        },
      }),
      prisma.scadenza.findMany({
        where: {
          ...scadenzaBase,
          // Solo scadute recenti + future ≤90gg (niente oltre 90 giorni)
          dataScadenza: { gte: startOf90DaysAgo, lte: endOf90Days },
        },
        orderBy: { dataScadenza: "asc" },
        take: 8,
        include: {
          documento: { select: { id: true, titoloOriginale: true } },
          dipendente: { select: { id: true, nome: true, cognome: true } },
          automezzo: { select: { id: true, targa: true } },
        },
      }),
      prisma.preventivo.groupBy({
        by: ["stato"],
        where: preventivoWhere,
        _count: { stato: true },
      }),
      prisma.preventivo.findMany({
        where: preventivoWhere,
        take: 8,
        orderBy: { updatedAt: "desc" },
        include: {
          cliente: { select: { id: true, ragioneSociale: true } },
          operatore: { select: { id: true, name: true } },
        },
      }),
      prisma.preventivo.aggregate({
        where: {
          ...preventivoWhere,
          stato: { in: ["BOZZA", "IN_REVISIONE", "INVIATO"] },
        },
        _sum: { totaleFinale: true },
        _count: true,
      }),
      isOperatore ? Promise.resolve(0) : prisma.cliente.count(),
      prisma.documento.count({
        where: { dataScadenza: null, nonServeScadenza: false },
      }),
      prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*)::bigint AS count
        FROM "Articolo"
        WHERE "attivo" = true
          AND "sogliaMinima" > 0
          AND "quantita" <= "sogliaMinima"
      `,
      prisma.$queryRaw<
        Array<{
          id: string;
          codice: string;
          nome: string;
          quantita: Prisma.Decimal;
          sogliaMinima: Prisma.Decimal;
          unitaMisura: string;
        }>
      >`
        SELECT id, codice, nome, quantita, "sogliaMinima", "unitaMisura"
        FROM "Articolo"
        WHERE "attivo" = true
          AND "sogliaMinima" > 0
          AND "quantita" <= "sogliaMinima"
        ORDER BY quantita ASC, nome ASC
        LIMIT 5
      `,
    ]);

    return NextResponse.json({
      perStato,
      preventivi,
      totaleClienti,
      scadenzeProssime,
      scadenzeUrgenti,
      scadenzeScadute,
      scadenze: scadenzeLista.map((s) => ({
        id: s.id,
        titolo: s.titolo,
        dataScadenza: s.dataScadenza,
        giorniRimanenti: giorniFinoScadenza(s.dataScadenza),
        documento: s.documento,
        dipendente: s.dipendente,
        automezzo: s.automezzo,
      })),
      preventiviAperti: {
        count: valoreAperti._count,
        valore: Number(valoreAperti._sum.totaleFinale ?? 0),
      },
      documentiDaClassificare,
      magazzinoSottoSoglia: Number(magazzinoSottoSoglia[0]?.count ?? 0),
      magazzinoAlert: magazzinoAlert.map((a) => ({
        id: a.id,
        codice: a.codice,
        nome: a.nome,
        quantita: toNum(a.quantita),
        sogliaMinima: toNum(a.sogliaMinima),
        unitaMisura: a.unitaMisura,
      })),
    });
  } catch (error) {
    console.error("[dashboard]", error);
    return NextResponse.json(
      { error: "Impossibile caricare la dashboard" },
      { status: 500 }
    );
  }
}
