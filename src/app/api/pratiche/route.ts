import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
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
  const manutentoreId = searchParams.get("manutentoreId");
  const search = searchParams.get("search");
  const page = parseInt(searchParams.get("page") ?? "1");
  const limit = 20;
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = {};

  if (session.user?.catId) {
    // Gli utenti collegati a un CAT vedono tutte e sole le pratiche di quel CAT.
    where.catId = session.user.catId;
  } else if (session.user?.role === "MANUTENTORE") {
    where.manutentoreId = session.user.id;
  } else {
    if (manutentoreId) where.manutentoreId = manutentoreId;
  }

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
        manutentore: { select: { id: true, name: true } },
        cat: { select: { id: true, ragioneSociale: true } },
      },
    }),
    prisma.pratica.count({ where }),
  ]);

  return NextResponse.json({ pratiche, total, page, totalPages: Math.ceil(total / limit) });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // La creazione/ricezione della pratica è riservata al personale interno Mistral
  // (Admin e operatori interni): manutentori e operatori CAT non creano pratiche.
  if (session.user?.role === "MANUTENTORE" || session.user?.catId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { clienteId, tipoIntervento, descrizione, manutentoreId, catId, noteInterne, stato } = body;

  if (!clienteId) {
    return NextResponse.json({ error: "clienteId obbligatorio" }, { status: 400 });
  }

  const statoIniziale = (stato as StatoPratica) || "RICEVUTA";
  const year = new Date().getFullYear();
  const prefix = `MIS-${year}-`;

  // Genera il numero pratica in modo resiliente: calcola il progressivo dal
  // massimo esistente dell'anno e riprova in caso di conflitto sull'unique
  // (create concorrenti). Evita i duplicati del vecchio approccio con count().
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
          operatoreId: session.user.id!,
          manutentoreId: manutentoreId || null,
          catId: catId || null,
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
    catId: null,
    manutentoreId: null,
    cat: null,
    manutentore: null,
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
