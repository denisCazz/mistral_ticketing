import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canAccessDocumentiHr } from "@/lib/access";
import { prisma } from "@/lib/db";
import { isAiWhitelistCandidate } from "@/lib/document-whitelist";
import { headR2Object, isR2Configured } from "@/lib/r2";
import type { EntityType, StatoValidita } from "@prisma/client";
import { parseScadenzaFromText } from "@/lib/scadenza-parser";

function hrWhere(canHr: boolean): Record<string, unknown> {
  if (canHr) return {};
  return {
    entityType: { not: "DIPENDENTE" },
    categoria: {
      notIn: ["UNILAV", "DOC", "IDONEITA", "F24", "DURC", "DURF"],
    },
  };
}

function categoriaSearchTerm(categoria: string): string {
  const aliases: Record<string, string> = {
    "DOCUMENTI PERSONALI": "DOC",
    IDONEITA: "IDONEIT",
    ASSICURAZIONI: "ASSICURAZION",
    LIBRETTI: "LIBRETT",
    VISURE: "VISUR",
  };
  return aliases[categoria] ?? categoria;
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const categoria = searchParams.get("categoria");
  const entityType = searchParams.get("entityType");
  const dipendenteId = searchParams.get("dipendenteId");
  const automezzoId = searchParams.get("automezzoId");
  const statoValidita = searchParams.get("statoValidita");
  const scadenza = searchParams.get("scadenza");
  const search = searchParams.get("search");
  const suggest = searchParams.get("suggest") === "1";
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const limit = Math.min(
    100,
    Math.max(1, parseInt(searchParams.get("limit") ?? "50", 10) || 50)
  );
  const skip = (page - 1) * limit;

  const canHr = canAccessDocumentiHr(session);
  const and: Record<string, unknown>[] = [
    { canonicalDocumentoId: null },
  ];

  if (!canHr) {
    and.push(hrWhere(false));
    if (entityType === "DIPENDENTE" || dipendenteId) {
      return NextResponse.json({
        documenti: [],
        total: 0,
        page: 1,
        totalPages: 1,
      });
    }
  }

  if (categoria) {
    and.push({
      categoria: {
        contains: categoriaSearchTerm(categoria),
        mode: "insensitive",
      },
    });
  }
  if (entityType) and.push({ entityType });
  if (dipendenteId) and.push({ dipendenteId });
  if (automezzoId) and.push({ automezzoId });
  if (statoValidita) and.push({ statoValidita });
  if (scadenza === "presenti") and.push({ dataScadenza: { not: null } });
  if (scadenza === "mancanti" || scadenza === "da-classificare") {
    and.push({ dataScadenza: null, nonServeScadenza: false });
  }
  if (scadenza === "non-serve") and.push({ nonServeScadenza: true });
  if (search) {
    and.push({
      OR: [
        { titoloOriginale: { contains: search, mode: "insensitive" } },
        { categoria: { contains: search, mode: "insensitive" } },
        { sourcePath: { contains: search, mode: "insensitive" } },
      ],
    });
  }

  const where = { AND: and };

  const [documenti, total] = await Promise.all([
    prisma.documento.findMany({
      where,
      skip,
      take: limit,
      orderBy: [{ categoria: "asc" }, { titoloOriginale: "asc" }],
      include: {
        dipendente: { select: { id: true, nome: true, cognome: true } },
        automezzo: { select: { id: true, targa: true } },
      },
    }),
    prisma.documento.count({ where }),
  ]);

  const payload = suggest
    ? documenti.map((doc) => {
        const folderHint = [doc.categoria, doc.sottocategoria]
          .filter(Boolean)
          .join("/");
        const parsed = parseScadenzaFromText(doc.titoloOriginale, folderHint);
        return {
          ...doc,
          suggestedScadenza: parsed.dataScadenza
            ? parsed.dataScadenza.toISOString().slice(0, 10)
            : null,
          suggestedConfidence: parsed.confidence,
          suggestedRaw: parsed.rawValue,
        };
      })
    : documenti;

  return NextResponse.json({
    documenti: payload,
    total,
    page,
    totalPages: Math.ceil(total / limit) || 1,
  });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!isR2Configured()) {
    return NextResponse.json({ error: "R2 non configurato" }, { status: 503 });
  }

  const body = await req.json();
  const storageKey = String(body.storageKey ?? "").trim();
  const sha256 = String(body.sha256 ?? "").trim().toLowerCase();
  const mimeType = String(body.mimeType ?? "application/octet-stream");
  const sizeBytes = Number(body.sizeBytes ?? 0);
  const titoloOriginale = String(body.titoloOriginale ?? "").trim();
  const categoria = String(body.categoria ?? "ALTRO").trim() || "ALTRO";
  const sottocategoria = body.sottocategoria
    ? String(body.sottocategoria)
    : null;
  const entityType = String(body.entityType ?? "AZIENDA") as EntityType;
  const dipendenteId = body.dipendenteId ? String(body.dipendenteId) : null;
  const automezzoId = body.automezzoId ? String(body.automezzoId) : null;
  const dataScadenza = body.dataScadenza
    ? new Date(String(body.dataScadenza))
    : null;

  if (!storageKey || !sha256 || !titoloOriginale || !sizeBytes) {
    return NextResponse.json(
      { error: "Campi obbligatori mancanti" },
      { status: 400 }
    );
  }

  if (!["DIPENDENTE", "AUTOMEZZO", "AZIENDA"].includes(entityType)) {
    return NextResponse.json({ error: "entityType non valido" }, { status: 400 });
  }

  if (entityType === "DIPENDENTE" && !dipendenteId) {
    return NextResponse.json(
      { error: "Seleziona un dipendente" },
      { status: 400 }
    );
  }
  if (entityType === "AUTOMEZZO" && !automezzoId) {
    return NextResponse.json(
      { error: "Seleziona un automezzo" },
      { status: 400 }
    );
  }

  const existsOnR2 = await headR2Object(storageKey);
  if (!existsOnR2) {
    return NextResponse.json(
      { error: "File non trovato su storage" },
      { status: 400 }
    );
  }

  const existing = await prisma.documento.findUnique({ where: { sha256 } });
  if (existing) {
    return NextResponse.json(
      {
        error: "Documento già presente (hash duplicato)",
        documento: existing,
      },
      { status: 409 }
    );
  }

  const whitelist = isAiWhitelistCandidate(
    categoria,
    sottocategoria,
    titoloOriginale
  );

  let statoValidita: StatoValidita = "DA_REVISIONARE";
  if (dataScadenza && !Number.isNaN(dataScadenza.getTime())) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    statoValidita =
      dataScadenza < today ? "SCADUTO" : "VALIDO";
  }

  const documento = await prisma.documento.create({
    data: {
      storageKey,
      sha256,
      mimeType,
      sizeBytes,
      titoloOriginale,
      categoria,
      sottocategoria,
      entityType,
      dipendenteId: entityType === "DIPENDENTE" ? dipendenteId : null,
      automezzoId: entityType === "AUTOMEZZO" ? automezzoId : null,
      dataScadenza:
        dataScadenza && !Number.isNaN(dataScadenza.getTime())
          ? dataScadenza
          : null,
      scadenzaSource: dataScadenza ? "MANUALE" : null,
      scadenzaConfidence: dataScadenza ? 1 : null,
      statoValidita,
      statoIngestione: "PENDING",
      aiWhitelist: whitelist,
    },
    include: {
      dipendente: { select: { id: true, nome: true, cognome: true } },
      automezzo: { select: { id: true, targa: true } },
    },
  });

  if (dataScadenza && !Number.isNaN(dataScadenza.getTime())) {
    await prisma.scadenza.create({
      data: {
        documentoId: documento.id,
        dipendenteId: documento.dipendenteId,
        automezzoId: documento.automezzoId,
        titolo: documento.titoloOriginale,
        dataScadenza,
        fonte: "MANUALE",
        confermata: true,
        confidence: 1,
      },
    });
  }

  return NextResponse.json({ documento }, { status: 201 });
}
