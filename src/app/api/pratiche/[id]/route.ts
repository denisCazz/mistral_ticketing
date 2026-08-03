import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canAccessPratica, canAssignOperatore } from "@/lib/access";
import { prisma } from "@/lib/db";
import {
  notifyPraticaChanges,
  praticaIncludeForNotify,
} from "@/lib/pratica-notifications";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const includeOperatori = new URL(req.url).searchParams.get("includeOperatori") === "1";
  const canIncludeOperatori =
    includeOperatori && canAssignOperatore(session);

  const [pratica, operatoriList] = await Promise.all([
    prisma.pratica.findUnique({
      where: { id },
      include: {
        cliente: true,
        operatore: { select: { id: true, name: true, email: true } },
        storia: {
          orderBy: { changedAt: "asc" },
          include: { changedBy: { select: { id: true, name: true } } },
        },
      },
    }),
    canIncludeOperatori
      ? prisma.user.findMany({
          where: { active: true, role: { in: ["ADMIN", "OPERATORE"] } },
          select: { id: true, name: true, email: true },
          orderBy: { name: "asc" },
        })
      : Promise.resolve(null),
  ]);

  if (!pratica) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (!canAccessPratica(session, pratica)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!includeOperatori || !operatoriList) {
    return NextResponse.json(pratica);
  }

  return NextResponse.json({ ...pratica, operatoriList });
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const { tipoIntervento, descrizione, operatoreId, noteInterne } = body;

  const before = await prisma.pratica.findUnique({
    where: { id },
    include: praticaIncludeForNotify,
  });
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canAccessPratica(session, before)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const data: Record<string, unknown> = {};
  if (tipoIntervento !== undefined) data.tipoIntervento = tipoIntervento;
  if (descrizione !== undefined) data.descrizione = descrizione;
  if (noteInterne !== undefined) data.noteInterne = noteInterne;

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
    data.operatoreId = target.id;
  }

  const pratica = await prisma.pratica.update({
    where: { id },
    data,
    include: praticaIncludeForNotify,
  });

  notifyPraticaChanges({
    before,
    after: pratica,
    statoDa: before.stato,
    statoA: pratica.stato,
    changedByName: session.user!.name ?? "Operatore",
    changedByEmail: session.user!.email,
  });

  return NextResponse.json(pratica);
}
