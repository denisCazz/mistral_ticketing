import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canAccessDocumentiHr } from "@/lib/access";
import { prisma } from "@/lib/db";
import { getPresignedDownloadUrl } from "@/lib/r2";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const documento = await prisma.documento.findUnique({
    where: { id },
    include: {
      dipendente: true,
      automezzo: true,
      scadenze: true,
      duplicati: { select: { id: true, titoloOriginale: true } },
    },
  });

  if (!documento) {
    return NextResponse.json({ error: "Non trovato" }, { status: 404 });
  }

  if (
    documento.entityType === "DIPENDENTE" &&
    !canAccessDocumentiHr(session)
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let downloadUrl: string | null = null;
  try {
    downloadUrl = await getPresignedDownloadUrl(documento.storageKey);
  } catch {
    downloadUrl = null;
  }

  return NextResponse.json({ documento, downloadUrl });
}

export async function PUT(req: Request, { params }: Params) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();

  const documento = await prisma.documento.update({
    where: { id },
    data: {
      categoria: body.categoria,
      sottocategoria: body.sottocategoria,
      dataScadenza: body.dataScadenza
        ? new Date(body.dataScadenza)
        : body.dataScadenza === null
          ? null
          : undefined,
      statoValidita: body.statoValidita,
      aiWhitelist: body.aiWhitelist,
      scadenzaSource: body.scadenzaSource,
    },
  });

  if (body.dataScadenza) {
    const existingScadenza = await prisma.scadenza.findFirst({
      where: { documentoId: id },
    });
    if (existingScadenza) {
      await prisma.scadenza.update({
        where: { id: existingScadenza.id },
        data: {
          dataScadenza: new Date(body.dataScadenza),
          confermata: true,
          fonte: "MANUALE",
        },
      });
    } else {
      await prisma.scadenza.create({
        data: {
          documentoId: id,
          titolo: documento.titoloOriginale,
          dataScadenza: new Date(body.dataScadenza),
          fonte: "MANUALE",
          confermata: true,
          confidence: 1,
        },
      });
    }
  }

  return NextResponse.json(documento);
}
