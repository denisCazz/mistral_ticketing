import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { giorniFinoScadenza } from "@/lib/scadenza-parser";
import { clampInt, finestraScadenze } from "@/lib/scadenza-agenda";

export async function GET(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const giorni = clampInt(searchParams.get("giorni"), 90, 1, 365);
  const passate = clampInt(searchParams.get("passate"), 90, 0, 365);
  const soloConfermate = searchParams.get("confermate") !== "false";
  const search = searchParams.get("search")?.trim() || "";
  const includeId = searchParams.get("includeId")?.trim() || "";
  const countsOnly = searchParams.get("countsOnly") === "1";

  const { from, to, start, end7 } = finestraScadenze(giorni, passate);
  const end90 = to;

  const accessWhere: Record<string, unknown> = {};
  if (soloConfermate) accessWhere.confermata = true;
  if (session.user.role === "OPERATORE") {
    accessWhere.responsabileId = session.user.id;
  }

  const searchWhere = search
    ? {
        OR: [
          { titolo: { contains: search, mode: "insensitive" } },
          { descrizione: { contains: search, mode: "insensitive" } },
          {
            documento: {
              titoloOriginale: { contains: search, mode: "insensitive" },
            },
          },
          {
            documento: {
              categoria: { contains: search, mode: "insensitive" },
            },
          },
          { dipendente: { nome: { contains: search, mode: "insensitive" } } },
          { dipendente: { cognome: { contains: search, mode: "insensitive" } } },
          { automezzo: { targa: { contains: search, mode: "insensitive" } } },
          { responsabile: { name: { contains: search, mode: "insensitive" } } },
        ],
      }
    : null;

  const listWhere: Record<string, unknown> = {
    ...accessWhere,
    dataScadenza: { gte: from, lte: end90 },
  };
  if (searchWhere) listWhere.AND = [searchWhere];

  const include = {
    documento: {
      select: { id: true, titoloOriginale: true, categoria: true },
    },
    dipendente: { select: { id: true, nome: true, cognome: true } },
    automezzo: { select: { id: true, targa: true } },
    responsabile: { select: { id: true, name: true } },
  };

  const [scadenze, extra, scadute, urgenti, prossime, daConfermare] =
    await Promise.all([
      countsOnly
        ? Promise.resolve([] as Array<{ id: string; dataScadenza: Date }>)
        : prisma.scadenza.findMany({
            where: listWhere,
            orderBy: { dataScadenza: "asc" },
            include,
          }),
      countsOnly || !includeId
        ? Promise.resolve(null)
        : prisma.scadenza.findFirst({
            where: { id: includeId, ...accessWhere },
            include,
          }),
      prisma.scadenza.count({
        where: {
          ...accessWhere,
          dataScadenza: { gte: from, lt: start },
        },
      }),
      prisma.scadenza.count({
        where: {
          ...accessWhere,
          dataScadenza: { gte: start, lte: end7 },
        },
      }),
      prisma.scadenza.count({
        where: {
          ...accessWhere,
          dataScadenza: { gte: start, lte: end90 },
        },
      }),
      prisma.scadenza.count({
        where: {
          ...accessWhere,
          confermata: false,
          dataScadenza: { gte: from, lte: end90 },
        },
      }),
    ]);

  const rows = extra && !scadenze.some((s) => s.id === extra.id)
    ? [...scadenze, extra].sort(
        (a, b) => a.dataScadenza.getTime() - b.dataScadenza.getTime()
      )
    : scadenze;

  return NextResponse.json({
    scadenze: rows.map((s) => ({
      ...s,
      giorniRimanenti: giorniFinoScadenza(s.dataScadenza),
    })),
    counts: {
      scadute,
      urgenti,
      prossime,
      daConfermare,
    },
  });
}
