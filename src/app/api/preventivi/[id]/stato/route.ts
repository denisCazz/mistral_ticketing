import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  canAccessPreventivo,
  canSetStatoPreventivo,
} from "@/lib/access";
import { prisma } from "@/lib/db";
import { StatoPreventivo } from "@prisma/client";
import {
  notifyPreventivoStatoChange,
  preventivoIncludeForNotify,
} from "@/lib/preventivo-notifications";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const { stato, note } = body as { stato: StatoPreventivo; note?: string };

  const preventivo = await prisma.preventivo.findUnique({
    where: { id },
    include: preventivoIncludeForNotify,
  });

  if (!preventivo) {
    return NextResponse.json({ error: "Non trovato" }, { status: 404 });
  }
  if (!canAccessPreventivo(session, preventivo)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!canSetStatoPreventivo(session, stato, preventivo.stato)) {
    return NextResponse.json({ error: "Stato non consentito" }, { status: 403 });
  }

  const updated = await prisma.$transaction(async (tx) => {
    const p = await tx.preventivo.update({
      where: { id },
      data: { stato },
      include: preventivoIncludeForNotify,
    });
    await tx.preventivoStoria.create({
      data: {
        preventivoId: id,
        statoDa: preventivo.stato,
        statoA: stato,
        changedById: session.user!.id!,
        note,
      },
    });
    return p;
  });

  notifyPreventivoStatoChange({
    preventivo: updated,
    statoDa: preventivo.stato,
    statoA: stato,
  });

  return NextResponse.json(updated);
}
