import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canAssignOperatore } from "@/lib/access";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { calcolaTotaliPreventivo } from "@/lib/preventivo-calcoli";
import { listPreventivi } from "@/lib/preventivi-queries";

export async function GET(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const result = await listPreventivi(session, {
    stato: searchParams.get("stato"),
    search: searchParams.get("search"),
    page: parseInt(searchParams.get("page") ?? "1", 10) || 1,
  });

  return NextResponse.json(result);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const {
    clienteId,
    operatoreId,
    introduzione,
    condizioni,
    validoFino,
    noteInterne,
    righe = [],
  } = body;

  if (!clienteId) {
    return NextResponse.json({ error: "clienteId obbligatorio" }, { status: 400 });
  }

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

  const totali = calcolaTotaliPreventivo(
    (righe as Array<Record<string, unknown>>).map((r) => ({
      descrizione: String(r.descrizione ?? ""),
      quantita: Number(r.quantita) || 1,
      prezzoUnitario: Number(r.prezzoUnitario) || 0,
      scontoPercentuale: Number(r.scontoPercentuale) || 0,
      aliquotaIva: Number(r.aliquotaIva) || 22,
    }))
  );

  const year = new Date().getFullYear();
  const prefix = `PREV-${year}-`;

  let preventivo;
  for (let attempt = 0; attempt < 5; attempt++) {
    const ultima = await prisma.preventivo.findFirst({
      where: { numeroPreventivo: { startsWith: prefix } },
      orderBy: { numeroPreventivo: "desc" },
      select: { numeroPreventivo: true },
    });
    const ultimoNum = ultima
      ? parseInt(ultima.numeroPreventivo.slice(prefix.length), 10) || 0
      : 0;
    const numeroPreventivo = `${prefix}${String(ultimoNum + 1).padStart(4, "0")}`;

    try {
      preventivo = await prisma.preventivo.create({
        data: {
          numeroPreventivo,
          clienteId,
          operatoreId: assegnatarioId,
          stato: "BOZZA",
          introduzione,
          condizioni,
          validoFino: validoFino ? new Date(validoFino) : null,
          noteInterne,
          totaleImponibile: totali.totaleImponibile,
          totaleIva: totali.totaleIva,
          totaleFinale: totali.totaleFinale,
          righe: {
            create: (righe as Array<Record<string, unknown>>).map((r, i) => ({
              ordine: i,
              descrizione: String(r.descrizione ?? ""),
              quantita: Number(r.quantita) || 1,
              prezzoUnitario: Number(r.prezzoUnitario) || 0,
              scontoPercentuale: Number(r.scontoPercentuale) || 0,
              aliquotaIva: Number(r.aliquotaIva) || 22,
            })),
          },
        },
        include: {
          cliente: true,
          operatore: true,
          righe: { orderBy: { ordine: "asc" } },
        },
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

  if (!preventivo) {
    return NextResponse.json(
      { error: "Impossibile generare numero preventivo" },
      { status: 409 }
    );
  }

  const snapshot = {
    introduzione: preventivo.introduzione,
    condizioni: preventivo.condizioni,
    validoFino: preventivo.validoFino,
    righe: preventivo.righe,
    totali,
  };

  await prisma.preventivoVersione.create({
    data: {
      preventivoId: preventivo.id,
      numeroVersione: 1,
      snapshotJson: JSON.parse(JSON.stringify(snapshot)),
      createdById: session.user.id!,
      motivo: "Creazione",
    },
  });

  await prisma.preventivoStoria.create({
    data: {
      preventivoId: preventivo.id,
      statoA: "BOZZA",
      changedById: session.user.id!,
      note: "Preventivo creato",
    },
  });

  return NextResponse.json(preventivo, { status: 201 });
}
