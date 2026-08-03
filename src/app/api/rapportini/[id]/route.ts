import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { toDateOnlyString } from "@/types/rapportino";

function mapRapportino(r: {
  dataRichiesta: Date | null;
  dataIntervento: Date;
  dataAcquisto: Date | null;
  prossimoIntervento: Date | null;
  createdAt: Date;
  updatedAt: Date;
  [key: string]: unknown;
}) {
  return {
    ...r,
    dataRichiesta: toDateOnlyString(r.dataRichiesta),
    dataIntervento: toDateOnlyString(r.dataIntervento)!,
    dataAcquisto: toDateOnlyString(r.dataAcquisto),
    prossimoIntervento: toDateOnlyString(r.prossimoIntervento),
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const row = await prisma.rapportino.findUnique({
    where: { id },
    include: {
      cliente: true,
      utente: { select: { id: true, name: true, email: true, qualifica: true } },
      pratica: { select: { id: true, numeroPratica: true } },
    },
  });

  if (!row) {
    return NextResponse.json({ error: "Non trovato" }, { status: 404 });
  }

  if (session.user.role !== "ADMIN" && row.utenteId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json(mapRapportino(row));
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const row = await prisma.rapportino.findUnique({ where: { id } });
  if (!row) {
    return NextResponse.json({ error: "Non trovato" }, { status: 404 });
  }

  if (session.user.role !== "ADMIN" && row.utenteId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await prisma.rapportino.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
