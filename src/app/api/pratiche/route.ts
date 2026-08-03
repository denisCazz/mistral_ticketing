import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canAssignOperatore, praticaWhereForSession } from "@/lib/access";
import { prisma } from "@/lib/db";
import { Prisma, StatoPratica } from "@prisma/client";
import {
  notifyPraticaChanges,
  praticaIncludeForNotify,
  type PraticaForNotify,
} from "@/lib/pratica-notifications";

export async function GET(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const stato = searchParams.get("stato") as StatoPratica | null;
  const search = searchParams.get("search");
  const page = parseInt(searchParams.get("page") ?? "1");
  const limit = 20;
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = {
    ...praticaWhereForSession(session),
  };

  if (stato) where.stato = stato;

  if (search) {
    where.OR = [
      { numeroPratica: { contains: search, mode: "insensitive" } },
      { cliente: { ragioneSociale: { contains: search, mode: "insensitive" } } },
      { descrizione: { contains: search, mode: "insensitive" } },
    ];
  }

  const [pratiche, total] = await Promise.all([
    prisma.pratica.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      include: {
        cliente: { select: { id: true, ragioneSociale: true, cellulare: true } },
        operatore: { select: { id: true, name: true } },
      },
    }),
    prisma.pratica.count({ where }),
  ]);

  return NextResponse.json({ pratiche, total, page, totalPages: Math.ceil(total / limit) });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { clienteId, tipoIntervento, descrizione, operatoreId, noteInterne, stato } = body;

  if (!clienteId) {
    return NextResponse.json({ error: "clienteId obbligatorio" }, { status: 400 });
  }

  // Admin può assegnare a un operatore; altrimenti la pratica va a chi la crea.
  let assegnatarioId = session.user.id!;
  if (operatoreId && canAssignOperatore(session)) {
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
    assegnatarioId = target.id;
  }

  const statoIniziale = (stato as StatoPratica) || "RICEVUTA";
  const year = new Date().getFullYear();
  const prefix = `MIS-${year}-`;

  let pratica;
  for (let attempt = 0; attempt < 5; attempt++) {
    const ultima = await prisma.pratica.findFirst({
      where: { numeroPratica: { startsWith: prefix } },
      orderBy: { numeroPratica: "desc" },
      select: { numeroPratica: true },
    });
    const ultimoNum = ultima
      ? parseInt(ultima.numeroPratica.slice(prefix.length), 10) || 0
      : 0;
    const numeroPratica = `${prefix}${String(ultimoNum + 1).padStart(4, "0")}`;

    try {
      pratica = await prisma.pratica.create({
        data: {
          numeroPratica,
          clienteId,
          tipoIntervento,
          descrizione,
          stato: statoIniziale,
          operatoreId: assegnatarioId,
          noteInterne,
        },
        include: praticaIncludeForNotify,
      });
      break;
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002" &&
        attempt < 4
      ) {
        continue;
      }
      throw err;
    }
  }

  if (!pratica) {
    return NextResponse.json(
      { error: "Impossibile generare il numero pratica, riprova" },
      { status: 409 }
    );
  }

  await prisma.praticaStoria.create({
    data: {
      praticaId: pratica.id,
      statoA: statoIniziale,
      changedById: session.user.id!,
      note: "Pratica creata",
    },
  });

  const before: PraticaForNotify = {
    ...pratica,
    operatoreId: session.user.id!,
  };

  notifyPraticaChanges({
    before,
    after: pratica,
    statoDa: null,
    statoA: statoIniziale,
    changedByName: session.user!.name ?? "Operatore",
    changedByEmail: session.user!.email,
    note: "Pratica creata",
  });

  return NextResponse.json(pratica, { status: 201 });
}
