import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

type Params = { params: Promise<{ id: string }> };

export async function PUT(req: Request, { params }: Params) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();

  const existing = await prisma.scadenza.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Non trovato" }, { status: 404 });
  }

  if (
    session.user.role === "OPERATORE" &&
    existing.responsabileId !== session.user.id
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const scadenza = await prisma.scadenza.update({
    where: { id },
    data: {
      titolo: body.titolo ?? existing.titolo,
      descrizione: body.descrizione ?? existing.descrizione,
      dataScadenza: body.dataScadenza
        ? new Date(body.dataScadenza)
        : existing.dataScadenza,
      confermata: body.confermata ?? existing.confermata,
      responsabileId: body.responsabileId ?? existing.responsabileId,
      fonte: body.confermata ? "MANUALE" : existing.fonte,
    },
  });

  if (existing.documentoId && body.confermata) {
    await prisma.documento.update({
      where: { id: existing.documentoId },
      data: {
        dataScadenza: scadenza.dataScadenza,
        scadenzaSource: "MANUALE",
        scadenzaConfidence: 1,
        statoValidita: "VALIDO",
        statoIngestione: "READY",
      },
    });
  }

  return NextResponse.json(scadenza);
}
