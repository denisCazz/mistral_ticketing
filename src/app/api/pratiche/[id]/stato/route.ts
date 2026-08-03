import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canAccessPratica, canSetStato } from "@/lib/access";
import { prisma } from "@/lib/db";
import { z } from "zod";
import { STATO_LABELS } from "@/lib/constants";
import { StatoPratica } from "@prisma/client";
import {
  notifyPraticaChanges,
  praticaIncludeForNotify,
} from "@/lib/pratica-notifications";

const schema = z.object({
  stato: z.nativeEnum(StatoPratica),
  note: z.string().optional(),
  manutentoreId: z.string().optional().nullable(),
  catId: z.string().optional().nullable(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Manutentore senza CAT: sola lettura. Con CAT collegato: può aggiornare gli stati.
  if (session.user?.role === "MANUTENTORE" && !session.user?.catId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { stato, note, manutentoreId, catId } = parsed.data;

  // Verifica che il ruolo possa impostare questo specifico stato
  // partendo dallo stato attuale della pratica.
  const pratica = await prisma.pratica.findUnique({
    where: { id },
    include: praticaIncludeForNotify,
  });
  if (!pratica) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canAccessPratica(session, pratica)) {
    return NextResponse.json(
      {
        error: session.user?.catId
          ? "Non hai accesso a questa pratica"
          : session.user?.role === "MANUTENTORE"
            ? "Sessione scaduta o profilo non collegato al CAT — effettua logout e login"
            : "Non hai accesso a questa pratica",
      },
      { status: 403 }
    );
  }

  if (!canSetStato(session, stato, pratica.stato)) {
    return NextResponse.json(
      {
        error:
          pratica.stato === "RICEVUTA" && session.user?.catId
            ? "In attesa di presa in carico da Mistral Impianti"
            : stato === pratica.stato
              ? "Seleziona uno stato diverso da quello attuale"
              : `Non puoi impostare «${STATO_LABELS[stato]}» partendo da «${STATO_LABELS[pratica.stato]}»`,
      },
      { status: 403 }
    );
  }

  const updateData: Record<string, unknown> = { stato };
  if (manutentoreId !== undefined) updateData.manutentoreId = manutentoreId || null;
  if (catId !== undefined) {
    if (session.user?.catId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    updateData.catId = catId || null;
  }

  const [updated] = await prisma.$transaction([
    prisma.pratica.update({
      where: { id },
      data: updateData,
      include: {
        ...praticaIncludeForNotify,
        storia: {
          orderBy: { changedAt: "asc" },
          include: { changedBy: { select: { id: true, name: true } } },
        },
      },
    }),
    prisma.praticaStoria.create({
      data: {
        praticaId: id,
        statoDa: pratica.stato,
        statoA: stato,
        changedById: session.user!.id!,
        note: note || null,
      },
    }),
  ]);

  notifyPraticaChanges({
    before: pratica,
    after: updated,
    statoDa: pratica.stato,
    statoA: stato,
    changedByName: session.user!.name ?? "Operatore",
    changedByEmail: session.user!.email,
    note,
  });

  return NextResponse.json(updated);
}
