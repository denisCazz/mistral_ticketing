import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { STATI_CHIUSURA } from "@/lib/constants";
import { StatoPratica } from "@prisma/client";

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user?.role === "MANUTENTORE") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [
    perStato,
    totaleClienti,
    totaleCat,
    perCatRaw,
    preseInCaricoRaw,
    perManutentoreRaw,
    completate,
    tuttiCreatedAt,
  ] = await Promise.all([
    prisma.pratica.groupBy({ by: ["stato"], _count: { stato: true } }),
    prisma.cliente.count(),
    prisma.cat.count({ where: { active: true } }),
    prisma.pratica.groupBy({ by: ["catId"], _count: { catId: true } }),
    // "Per operatore" = chi ha preso in carico la pratica (non chi l'ha creata,
    // che è sempre l'admin). Si basa sullo storico delle transizioni di stato.
    prisma.praticaStoria.findMany({
      where: { statoA: "PRESA_IN_CARICO" },
      select: { praticaId: true, changedById: true },
      distinct: ["praticaId", "changedById"],
    }),
    prisma.pratica.groupBy({ by: ["manutentoreId"], _count: { manutentoreId: true } }),
    prisma.pratica.findMany({
      where: { stato: "COMPLETATA" },
      select: { createdAt: true, updatedAt: true },
    }),
    prisma.pratica.findMany({ select: { createdAt: true } }),
  ]);

  const totalePratiche = perStato.reduce((s, x) => s + x._count.stato, 0);
  const chiuse = perStato
    .filter((x) => STATI_CHIUSURA.includes(x.stato))
    .reduce((s, x) => s + x._count.stato, 0);
  const aperte = totalePratiche - chiuse;

  // Tempo medio di risoluzione (giorni) sulle pratiche completate
  let tempoMedioGiorni: number | null = null;
  if (completate.length > 0) {
    const totMs = completate.reduce(
      (acc, p) => acc + (p.updatedAt.getTime() - p.createdAt.getTime()),
      0
    );
    tempoMedioGiorni = totMs / completate.length / (1000 * 60 * 60 * 24);
  }

  // Risoluzione nomi CAT
  const catIds = perCatRaw.map((c) => c.catId).filter((id): id is string => !!id);
  const cats = catIds.length
    ? await prisma.cat.findMany({
        where: { id: { in: catIds } },
        select: { id: true, ragioneSociale: true },
      })
    : [];
  const catMap = new Map(cats.map((c) => [c.id, c.ragioneSociale]));
  const perCat = perCatRaw
    .map((c) => ({
      id: c.catId,
      label: c.catId ? catMap.get(c.catId) ?? "CAT rimosso" : "Nessun CAT",
      count: c._count.catId,
    }))
    .sort((a, b) => b.count - a.count);

  // Conteggio prese in carico per operatore.
  const preseCount = new Map<string, number>();
  for (const p of preseInCaricoRaw) {
    preseCount.set(p.changedById, (preseCount.get(p.changedById) ?? 0) + 1);
  }

  // Risoluzione nomi operatori e manutentori
  const operatoreIds = [...preseCount.keys()];
  const manutentoreIds = perManutentoreRaw
    .map((m) => m.manutentoreId)
    .filter((id): id is string => !!id);
  const userIds = [...new Set([...operatoreIds, ...manutentoreIds])];
  const users = userIds.length
    ? await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true },
      })
    : [];
  const userMap = new Map(users.map((u) => [u.id, u.name]));

  const perOperatore = [...preseCount.entries()]
    .map(([id, count]) => ({
      id,
      label: userMap.get(id) ?? "—",
      count,
    }))
    .sort((a, b) => b.count - a.count);

  const perManutentore = perManutentoreRaw
    .map((m) => ({
      id: m.manutentoreId,
      label: m.manutentoreId ? userMap.get(m.manutentoreId) ?? "—" : "Non assegnato",
      count: m._count.manutentoreId,
    }))
    .sort((a, b) => b.count - a.count);

  // Pratiche per mese (ultimi 12 mesi)
  const now = new Date();
  const mesi: { key: string; label: string; count: number }[] = [];
  const meseLabels = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];
  const idxByKey = new Map<string, number>();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    idxByKey.set(key, mesi.length);
    mesi.push({ key, label: `${meseLabels[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`, count: 0 });
  }
  for (const p of tuttiCreatedAt) {
    const d = p.createdAt;
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    const idx = idxByKey.get(key);
    if (idx !== undefined) mesi[idx].count++;
  }

  const perStatoObj = perStato.map((s) => ({
    stato: s.stato as StatoPratica,
    count: s._count.stato,
  }));

  return NextResponse.json({
    totali: {
      pratiche: totalePratiche,
      aperte,
      chiuse,
      clienti: totaleClienti,
      cat: totaleCat,
      tempoMedioGiorni,
    },
    perStato: perStatoObj,
    perCat,
    perOperatore,
    perManutentore,
    perMese: mesi,
  });
}
