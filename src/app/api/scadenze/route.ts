import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { giorniFinoScadenza } from "@/lib/scadenza-parser";

export async function GET(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const giorni = parseInt(searchParams.get("giorni") ?? "60");
  const soloConfermate = searchParams.get("confermate") !== "false";

  const now = new Date();
  const end = new Date();
  end.setDate(end.getDate() + giorni);

  const where: Record<string, unknown> = {
    dataScadenza: { gte: now, lte: end },
  };
  if (soloConfermate) where.confermata = true;

  if (session.user.role === "OPERATORE") {
    where.responsabileId = session.user.id;
  }

  const scadenze = await prisma.scadenza.findMany({
    where,
    orderBy: { dataScadenza: "asc" },
    include: {
      documento: { select: { id: true, titoloOriginale: true, categoria: true } },
      dipendente: { select: { id: true, nome: true, cognome: true } },
      automezzo: { select: { id: true, targa: true } },
      responsabile: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json({
    scadenze: scadenze.map((s) => ({
      ...s,
      giorniRimanenti: giorniFinoScadenza(s.dataScadenza),
    })),
  });
}
