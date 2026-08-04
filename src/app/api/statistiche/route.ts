import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { preventivoWhereForSession } from "@/lib/access";
import {
  STATI_PREVENTIVO_CHIUSURA,
  STATI_PREVENTIVO_ORDINE,
} from "@/lib/preventivo-constants";
import { Prisma, StatoPreventivo } from "@prisma/client";

const PERIODI_CONSENTITI = [3, 6, 12, 24] as const;

function variazionePercentuale(attuale: number, precedente: number) {
  if (precedente === 0) return attuale === 0 ? 0 : null;
  return ((attuale - precedente) / precedente) * 100;
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const requestedMonths = Number(new URL(request.url).searchParams.get("mesi"));
  const mesiPeriodo = PERIODI_CONSENTITI.includes(
    requestedMonths as (typeof PERIODI_CONSENTITI)[number]
  )
    ? requestedMonths
    : 12;
  const now = new Date();
  const inizioPeriodo = new Date(
    now.getFullYear(),
    now.getMonth() - mesiPeriodo + 1,
    1
  );
  const inizioPeriodoPrecedente = new Date(
    inizioPeriodo.getFullYear(),
    inizioPeriodo.getMonth() - mesiPeriodo,
    1
  );

  const accessWhere = preventivoWhereForSession(
    session
  ) as Prisma.PreventivoWhereInput;
  const preventivoWhere: Prisma.PreventivoWhereInput = {
    ...accessWhere,
    createdAt: { gte: inizioPeriodo },
  };
  const preventivoWherePrecedente: Prisma.PreventivoWhereInput = {
    ...accessWhere,
    createdAt: { gte: inizioPeriodoPrecedente, lt: inizioPeriodo },
  };

  const [
    perStato,
    perOperatoreRaw,
    clientiRaw,
    eventiAccettazione,
    preventiviMensili,
    valori,
    valoreAccettato,
    periodoPrecedente,
  ] = await Promise.all([
    prisma.preventivo.groupBy({
      by: ["stato"],
      where: preventivoWhere,
      _count: { stato: true },
    }),
    prisma.preventivo.groupBy({
      by: ["operatoreId"],
      where: preventivoWhere,
      _count: { operatoreId: true },
      _sum: { totaleFinale: true },
    }),
    prisma.preventivo.groupBy({
      by: ["clienteId"],
      where: preventivoWhere,
    }),
    prisma.preventivoStoria.findMany({
      where: {
        statoA: "ACCETTATO",
        preventivo: preventivoWhere,
      },
      orderBy: { changedAt: "asc" },
      select: {
        preventivoId: true,
        changedAt: true,
        preventivo: { select: { createdAt: true } },
      },
    }),
    prisma.preventivo.findMany({
      where: preventivoWhere,
      select: { createdAt: true, totaleFinale: true },
    }),
    prisma.preventivo.aggregate({
      where: preventivoWhere,
      _sum: { totaleFinale: true },
      _avg: { totaleFinale: true },
    }),
    prisma.preventivo.aggregate({
      where: { ...preventivoWhere, stato: "ACCETTATO" },
      _sum: { totaleFinale: true },
    }),
    prisma.preventivo.aggregate({
      where: preventivoWherePrecedente,
      _count: { _all: true },
      _sum: { totaleFinale: true },
    }),
  ]);

  const totalePreventivi = perStato.reduce((s, x) => s + x._count.stato, 0);
  const chiuse = perStato
    .filter((x) => STATI_PREVENTIVO_CHIUSURA.includes(x.stato))
    .reduce((s, x) => s + x._count.stato, 0);
  const aperte = totalePreventivi - chiuse;

  let tempoMedioGiorni: number | null = null;
  const primaAccettazione = new Map<
    string,
    (typeof eventiAccettazione)[number]
  >();
  for (const evento of eventiAccettazione) {
    if (!primaAccettazione.has(evento.preventivoId)) {
      primaAccettazione.set(evento.preventivoId, evento);
    }
  }
  if (primaAccettazione.size > 0) {
    const totMs = [...primaAccettazione.values()].reduce(
      (acc, evento) =>
        acc +
        (evento.changedAt.getTime() - evento.preventivo.createdAt.getTime()),
      0
    );
    tempoMedioGiorni =
      totMs / primaAccettazione.size / (1000 * 60 * 60 * 24);
  }

  const operatoreIds = perOperatoreRaw.map((o) => o.operatoreId);
  const users = operatoreIds.length
    ? await prisma.user.findMany({
        where: { id: { in: operatoreIds } },
        select: { id: true, name: true },
      })
    : [];
  const userMap = new Map(users.map((u) => [u.id, u.name]));

  const perOperatore = perOperatoreRaw
    .map((o) => ({
      id: o.operatoreId,
      label: userMap.get(o.operatoreId) ?? "—",
      count: o._count.operatoreId,
      value: Number(o._sum.totaleFinale ?? 0),
    }))
    .sort((a, b) => b.count - a.count);

  const mesi: { key: string; label: string; count: number; value: number }[] = [];
  const meseLabels = [
    "Gen", "Feb", "Mar", "Apr", "Mag", "Giu",
    "Lug", "Ago", "Set", "Ott", "Nov", "Dic",
  ];
  const idxByKey = new Map<string, number>();
  for (let i = mesiPeriodo - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    idxByKey.set(key, mesi.length);
    mesi.push({
      key,
      label: `${meseLabels[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`,
      count: 0,
      value: 0,
    });
  }
  for (const p of preventiviMensili) {
    const d = p.createdAt;
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    const idx = idxByKey.get(key);
    if (idx !== undefined) {
      mesi[idx].count++;
      mesi[idx].value += Number(p.totaleFinale ?? 0);
    }
  }

  const countByStato = new Map(
    perStato.map((s) => [s.stato, s._count.stato])
  );
  const perStatoObj = STATI_PREVENTIVO_ORDINE.map((stato) => ({
    stato: stato as StatoPreventivo,
    count: countByStato.get(stato) ?? 0,
  }));
  const accettati = countByStato.get("ACCETTATO") ?? 0;
  const rifiutati = countByStato.get("RIFIUTATO") ?? 0;
  const esiti = accettati + rifiutati;
  const valoreTotale = Number(valori._sum.totaleFinale ?? 0);
  const valorePrecedente = Number(
    periodoPrecedente._sum.totaleFinale ?? 0
  );

  return NextResponse.json({
    periodo: {
      mesi: mesiPeriodo,
      dal: inizioPeriodo.toISOString(),
      al: now.toISOString(),
    },
    isAdmin: session.user?.role === "ADMIN",
    totali: {
      preventivi: totalePreventivi,
      aperte,
      chiuse,
      clienti: clientiRaw.length,
      operatori: perOperatore.length,
      tempoMedioGiorni,
      valoreTotale,
      valoreAccettato: Number(valoreAccettato._sum.totaleFinale ?? 0),
      valoreMedio: Number(valori._avg.totaleFinale ?? 0),
      tassoAccettazione: esiti > 0 ? (accettati / esiti) * 100 : null,
    },
    confronto: {
      preventivi: variazionePercentuale(
        totalePreventivi,
        periodoPrecedente._count._all
      ),
      valore: variazionePercentuale(valoreTotale, valorePrecedente),
    },
    perStato: perStatoObj,
    perOperatore,
    perMese: mesi,
  });
}
