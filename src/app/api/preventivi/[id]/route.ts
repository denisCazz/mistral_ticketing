import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  canAccessPreventivo,
  canAssignOperatore,
} from "@/lib/access";
import { prisma } from "@/lib/db";
import { calcolaTotaliPreventivo } from "@/lib/preventivo-calcoli";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const preventivo = await prisma.preventivo.findUnique({
    where: { id },
    include: {
      cliente: true,
      operatore: { select: { id: true, name: true, email: true } },
      righe: { orderBy: { ordine: "asc" } },
      versioni: { orderBy: { numeroVersione: "desc" }, take: 20 },
      storia: {
        orderBy: { changedAt: "desc" },
        include: { changedBy: { select: { name: true } } },
      },
      exports: { orderBy: { createdAt: "desc" }, take: 10 },
    },
  });

  if (!preventivo) {
    return NextResponse.json({ error: "Non trovato" }, { status: 404 });
  }
  if (!canAccessPreventivo(session, preventivo)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json(preventivo);
}

export async function PUT(req: Request, { params }: Params) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const existing = await prisma.preventivo.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Non trovato" }, { status: 404 });
  }
  if (!canAccessPreventivo(session, existing)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const {
    introduzione,
    condizioni,
    validoFino,
    noteInterne,
    operatoreId,
    righe,
    createVersion,
    motivoVersione,
    expectedVersion,
  } = body;

  if (expectedVersion && expectedVersion !== existing.versione) {
    return NextResponse.json(
      { error: "Conflitto versione — ricarica il preventivo" },
      { status: 409 }
    );
  }

  let operatoreUpdate: string | undefined;
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
    operatoreUpdate = target.id;
  }

  let totaliUpdate: {
    totaleImponibile: number;
    totaleIva: number;
    totaleFinale: number;
  } | null = null;

  if (Array.isArray(righe)) {
    totaliUpdate = calcolaTotaliPreventivo(
      righe.map((r: Record<string, unknown>) => ({
        descrizione: String(r.descrizione ?? ""),
        quantita: Number(r.quantita) || 1,
        prezzoUnitario: Number(r.prezzoUnitario) || 0,
        scontoPercentuale: Number(r.scontoPercentuale) || 0,
        aliquotaIva: Number(r.aliquotaIva) || 22,
      }))
    );

    await prisma.preventivoRiga.deleteMany({ where: { preventivoId: id } });
    await prisma.preventivoRiga.createMany({
      data: righe.map((r: Record<string, unknown>, i: number) => ({
        preventivoId: id,
        ordine: i,
        descrizione: String(r.descrizione ?? ""),
        quantita: Number(r.quantita) || 1,
        prezzoUnitario: Number(r.prezzoUnitario) || 0,
        scontoPercentuale: Number(r.scontoPercentuale) || 0,
        aliquotaIva: Number(r.aliquotaIva) || 22,
      })),
    });
  }

  const nuovaVersione = existing.versione + (createVersion ? 1 : 0);

  const preventivo = await prisma.preventivo.update({
    where: { id },
    data: {
      introduzione: introduzione ?? existing.introduzione,
      condizioni: condizioni ?? existing.condizioni,
      validoFino:
        validoFino !== undefined
          ? validoFino
            ? new Date(validoFino)
            : null
          : existing.validoFino,
      noteInterne: noteInterne ?? existing.noteInterne,
      operatoreId: operatoreUpdate ?? existing.operatoreId,
      versione: nuovaVersione,
      totaleImponibile: totaliUpdate?.totaleImponibile ?? existing.totaleImponibile,
      totaleIva: totaliUpdate?.totaleIva ?? existing.totaleIva,
      totaleFinale: totaliUpdate?.totaleFinale ?? existing.totaleFinale,
    },
    include: {
      cliente: true,
      operatore: { select: { id: true, name: true, email: true } },
      righe: { orderBy: { ordine: "asc" } },
    },
  });

  if (createVersion) {
    await prisma.preventivoVersione.create({
      data: {
        preventivoId: id,
        numeroVersione: nuovaVersione,
        snapshotJson: JSON.parse(
          JSON.stringify({
            introduzione: preventivo.introduzione,
            condizioni: preventivo.condizioni,
            validoFino: preventivo.validoFino,
            righe: preventivo.righe,
            totali: totaliUpdate ?? {
              totaleImponibile: preventivo.totaleImponibile,
              totaleIva: preventivo.totaleIva,
              totaleFinale: preventivo.totaleFinale,
            },
          })
        ),
        createdById: session.user.id!,
        motivo: motivoVersione ?? "Revisione",
      },
    });
  }

  return NextResponse.json(preventivo);
}
