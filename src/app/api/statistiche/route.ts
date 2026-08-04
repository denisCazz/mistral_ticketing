import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { STATI_PREVENTIVO_CHIUSURA } from "@/lib/preventivo-constants";
import { StatoPreventivo } from "@prisma/client";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const preventivoWhere =
    session.user?.role === "OPERATORE"
      ? { operatoreId: session.user.id! }
      : {};

  const [
    perStato,
    totaleClienti,
    perOperatoreRaw,
    accettati,
    tuttiCreatedAt,
  ] = await Promise.all([
    prisma.preventivo.groupBy({
      by: ["stato"],
      where: preventivoWhere,
      _count: { stato: true },
    }),
    session.user?.role === "ADMIN" ? prisma.cliente.count() : Promise.resolve(0),
    prisma.preventivo.groupBy({
      by: ["operatoreId"],
      where: preventivoWhere,
      _count: { operatoreId: true },
    }),
    prisma.preventivo.findMany({
      where: { ...preventivoWhere, stato: "ACCETTATO" },
      select: { createdAt: true, updatedAt: true },
    }),
    prisma.preventivo.findMany({
      where: preventivoWhere,
      select: { createdAt: true },
    }),
  ]);

  const totalePreventivi = perStato.reduce((s, x) => s + x._count.stato, 0);
  const chiuse = perStato
    .filter((x) => STATI_PREVENTIVO_CHIUSURA.includes(x.stato))
    .reduce((s, x) => s + x._count.stato, 0);
  const aperte = totalePreventivi - chiuse;

  let tempoMedioGiorni: number | null = null;
  if (accettati.length > 0) {
    const totMs = accettati.reduce(
      (acc, p) => acc + (p.updatedAt.getTime() - p.createdAt.getTime()),
      0
    );
    tempoMedioGiorni = totMs / accettati.length / (1000 * 60 * 60 * 24);
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
    }))
    .sort((a, b) => b.count - a.count);

  const now = new Date();
  const mesi: { key: string; label: string; count: number }[] = [];
  const meseLabels = [
    "Gen", "Feb", "Mar", "Apr", "Mag", "Giu",
    "Lug", "Ago", "Set", "Ott", "Nov", "Dic",
  ];
  const idxByKey = new Map<string, number>();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    idxByKey.set(key, mesi.length);
    mesi.push({
      key,
      label: `${meseLabels[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`,
      count: 0,
    });
  }
  for (const p of tuttiCreatedAt) {
    const d = p.createdAt;
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    const idx = idxByKey.get(key);
    if (idx !== undefined) mesi[idx].count++;
  }

  const perStatoObj = perStato.map((s) => ({
    stato: s.stato as StatoPreventivo,
    count: s._count.stato,
  }));

  return NextResponse.json({
    totali: {
      preventivi: totalePreventivi,
      aperte,
      chiuse,
      clienti: totaleClienti,
      operatori: perOperatore.length,
      tempoMedioGiorni,
    },
    perStato: perStatoObj,
    perOperatore,
    perMese: mesi,
  });
}
