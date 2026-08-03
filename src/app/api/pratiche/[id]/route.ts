import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canAccessPratica } from "@/lib/access";
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
  const includeCats = new URL(req.url).searchParams.get("includeCats") === "1";
  const canIncludeCats = includeCats && session.user?.role !== "MANUTENTORE";

  const [pratica, catList] = await Promise.all([
    prisma.pratica.findUnique({
      where: { id },
      include: {
        cliente: true,
        operatore: { select: { id: true, name: true, email: true } },
        manutentore: { select: { id: true, name: true, email: true } },
        cat: { select: { id: true, ragioneSociale: true, emails: true, telefono: true, referenti: true } },
        storia: {
          orderBy: { changedAt: "asc" },
          include: { changedBy: { select: { id: true, name: true } } },
        },
      },
    }),
    canIncludeCats
      ? prisma.cat.findMany({
          where: { active: true },
          select: { id: true, ragioneSociale: true },
          orderBy: { ragioneSociale: "asc" },
        })
      : Promise.resolve(null),
  ]);

  if (!pratica) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (!canAccessPratica(session, pratica)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!includeCats || session.user?.role === "MANUTENTORE") {
    return NextResponse.json(pratica);
  }

  return NextResponse.json({ ...pratica, catList });
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user?.role === "MANUTENTORE") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();
  const { tipoIntervento, descrizione, manutentoreId, catId, noteInterne } = body;

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
  if (manutentoreId !== undefined) data.manutentoreId = manutentoreId || null;
  if (catId !== undefined) {
    if (session.user?.catId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    data.catId = catId || null;
  }
  if (noteInterne !== undefined) data.noteInterne = noteInterne;

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
