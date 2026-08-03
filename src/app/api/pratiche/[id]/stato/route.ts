import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canAccessPratica, canAssignOperatore, canSetStato } from "@/lib/access";
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
  operatoreId: z.string().optional().nullable(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { stato, note, operatoreId } = parsed.data;

  const pratica = await prisma.pratica.findUnique({
    where: { id },
    include: praticaIncludeForNotify,
  });
  if (!pratica) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canAccessPratica(session, pratica)) {
    return NextResponse.json(
      { error: "Non hai accesso a questa pratica" },
      { status: 403 }
    );
  }

  if (!canSetStato(session, stato, pratica.stato)) {
    return NextResponse.json(
      {
        error:
          stato === pratica.stato
            ? "Seleziona uno stato diverso da quello attuale"
            : `Non puoi impostare «${STATO_LABELS[stato]}» partendo da «${STATO_LABELS[pratica.stato]}»`,
      },
      { status: 403 }
    );
  }

  const updateData: Record<string, unknown> = { stato };

  if (operatoreId !== undefined) {
    if (!canAssignOperatore(session)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (!operatoreId) {
      return NextResponse.json({ error: "Operatore obbligatorio" }, { status: 400 });
    }
    const target = await prisma.user.findFirst({
      where: {
        id: operatoreId,
        active: true,
        role: { in: ["ADMIN", "OPERATORE"] },
      },
      select: { id: true },
    });
    if (!target) {
      return NextResponse.json({ error: "Operatore non valido" }, { status: 400 });
    }
    updateData.operatoreId = target.id;
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
