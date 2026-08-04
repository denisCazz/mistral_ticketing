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

  const nonServe =
    typeof body.nonServeScadenza === "boolean" ? body.nonServeScadenza : undefined;

  let dataScadenza: Date | null | undefined = undefined;
  if (nonServe === true) {
    dataScadenza = null;
  } else if (body.dataScadenza) {
    dataScadenza = new Date(body.dataScadenza);
  } else if (body.dataScadenza === null) {
    dataScadenza = null;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let statoValidita = body.statoValidita as string | undefined;
  if (dataScadenza instanceof Date && !Number.isNaN(dataScadenza.getTime())) {
    statoValidita = dataScadenza < today ? "SCADUTO" : "VALIDO";
  }

  const documento = await prisma.documento.update({
    where: { id },
    data: {
      categoria: body.categoria,
      sottocategoria: body.sottocategoria,
      dataScadenza,
      nonServeScadenza:
        nonServe === true
          ? true
          : dataScadenza instanceof Date
            ? false
            : nonServe === false
              ? false
              : undefined,
      statoValidita,
      aiWhitelist: body.aiWhitelist,
      scadenzaSource:
        nonServe === true
          ? null
          : body.scadenzaSource ??
            (dataScadenza instanceof Date ? "MANUALE" : undefined),
      scadenzaConfidence:
        nonServe === true
          ? null
          : dataScadenza instanceof Date
            ? (body.scadenzaConfidence ?? 1)
            : body.dataScadenza === null
              ? null
              : undefined,
      scadenzaRaw:
        nonServe === true
          ? null
          : body.scadenzaRaw !== undefined
            ? body.scadenzaRaw
            : body.dataScadenza === null
              ? null
              : undefined,
    },
  });

  if (nonServe === true || body.dataScadenza === null) {
    await prisma.scadenza.deleteMany({ where: { documentoId: id } });
  } else if (dataScadenza instanceof Date && !Number.isNaN(dataScadenza.getTime())) {
    const existingScadenza = await prisma.scadenza.findFirst({
      where: { documentoId: id },
    });
    if (existingScadenza) {
      await prisma.scadenza.update({
        where: { id: existingScadenza.id },
        data: {
          dataScadenza,
          confermata: true,
          fonte: body.scadenzaSource ?? "MANUALE",
          confidence: body.scadenzaConfidence ?? 1,
          rawValue: body.scadenzaRaw ?? existingScadenza.rawValue,
        },
      });
    } else {
      await prisma.scadenza.create({
        data: {
          documentoId: id,
          dipendenteId: documento.dipendenteId,
          automezzoId: documento.automezzoId,
          titolo: documento.titoloOriginale,
          dataScadenza,
          fonte: body.scadenzaSource ?? "MANUALE",
          confermata: true,
          confidence: body.scadenzaConfidence ?? 1,
          rawValue: body.scadenzaRaw ?? null,
        },
      });
    }
  }

  return NextResponse.json(documento);
}
