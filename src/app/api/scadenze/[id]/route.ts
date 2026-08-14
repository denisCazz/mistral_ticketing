import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  canAccessScadenza,
  canAssignScadenzaResponsabile,
} from "@/lib/access";
import { prisma } from "@/lib/db";
import { z } from "zod";

type Params = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  titolo: z.string().trim().min(1).max(200).optional(),
  descrizione: z.string().trim().max(2000).optional().nullable(),
  dataScadenza: z.string().min(1).optional(),
  confermata: z.boolean().optional(),
  responsabileId: z.string().min(1).nullable().optional(),
});

export async function PUT(req: Request, { params }: Params) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Richiesta non valida" }, { status: 400 });
  }

  const existing = await prisma.scadenza.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Non trovato" }, { status: 404 });
  }
  if (!canAccessScadenza(session, existing)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = parsed.data;
  if (
    body.responsabileId !== undefined &&
    !canAssignScadenzaResponsabile(session)
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let dataScadenza = existing.dataScadenza;
  if (body.dataScadenza !== undefined) {
    const parsedDate = new Date(body.dataScadenza);
    if (Number.isNaN(parsedDate.getTime())) {
      return NextResponse.json({ error: "Data non valida" }, { status: 400 });
    }
    dataScadenza = parsedDate;
  }

  const confermata = body.confermata ?? existing.confermata;

  const scadenza = await prisma.scadenza.update({
    where: { id },
    data: {
      titolo: body.titolo ?? existing.titolo,
      descrizione:
        body.descrizione !== undefined
          ? body.descrizione
          : existing.descrizione,
      dataScadenza,
      confermata,
      responsabileId: canAssignScadenzaResponsabile(session)
        ? (body.responsabileId ?? existing.responsabileId)
        : existing.responsabileId,
      fonte: confermata ? "MANUALE" : existing.fonte,
    },
  });

  if (existing.documentoId && confermata) {
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
