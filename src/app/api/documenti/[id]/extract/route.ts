import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canAccessDocumento } from "@/lib/access";
import { prisma } from "@/lib/db";
import { structureDocumento } from "@/lib/document-structure";
import {
  extractTextWithOcrFallback,
} from "@/lib/document-ingest";
import { downloadFromR2, isR2Configured } from "@/lib/r2";

type Params = { params: Promise<{ id: string }> };

/**
 * POST: OCR (se serve) + estrazione strutturata ibrida.
 * Query: ?force=1 per rieseguire, ?ocr=0 per saltare OCR.
 */
export async function POST(req: Request, { params }: Params) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const url = new URL(req.url);
  const force = url.searchParams.get("force") === "1";
  const enableOcr = url.searchParams.get("ocr") !== "0";

  const doc = await prisma.documento.findUnique({ where: { id } });
  if (!doc) {
    return NextResponse.json({ error: "Non trovato" }, { status: 404 });
  }

  let extractedText = doc.extractedText;
  let textSource: string | null = null;

  if (!extractedText || force) {
    if (!isR2Configured()) {
      return NextResponse.json(
        { error: "Storage non configurato" },
        { status: 503 }
      );
    }
    try {
      const buffer = await downloadFromR2(doc.storageKey);
      const extracted = await extractTextWithOcrFallback({
        buffer,
        mimeType: doc.mimeType,
        filename: doc.titoloOriginale,
        enableOcr,
      });
      extractedText = extracted.text;
      textSource = extracted.source;
      if (extractedText) {
        await prisma.documento.update({
          where: { id },
          data: {
            extractedText,
            statoIngestione: "READY",
          },
        });
        await prisma.documentoTesto.deleteMany({ where: { documentoId: id } });
        await prisma.documentoTesto.create({
          data: { documentoId: id, content: extractedText },
        });
      } else {
        await prisma.documento.update({
          where: { id },
          data: { statoIngestione: "DA_REVISIONARE" },
        });
        return NextResponse.json(
          {
            error: "Impossibile estrarre testo (nativo/OCR)",
            textSource: extracted.source,
          },
          { status: 422 }
        );
      }
    } catch (err) {
      console.error("extract/OCR failed:", err);
      return NextResponse.json(
        { error: "Errore lettura/OCR documento" },
        { status: 502 }
      );
    }
  }

  const structured = await structureDocumento(id, {
    force,
    userId: session.user.id,
  });

  const fresh = await prisma.documento.findUnique({
    where: { id },
    select: {
      extractionJson: true,
      extractionAt: true,
      dataScadenza: true,
      scadenzaConfidence: true,
      scadenzaSource: true,
      statoValidita: true,
      dipendenteId: true,
      automezzoId: true,
      nonServeScadenza: true,
    },
  });

  return NextResponse.json({
    textSource,
    structured,
    documento: fresh,
  });
}

export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const doc = await prisma.documento.findUnique({
    where: { id },
    select: {
      id: true,
      titoloOriginale: true,
      extractionJson: true,
      extractionAt: true,
      dataScadenza: true,
      scadenzaConfidence: true,
      scadenzaSource: true,
      scadenzaRaw: true,
      statoValidita: true,
      nonServeScadenza: true,
      dipendenteId: true,
      automezzoId: true,
      entityType: true,
      categoria: true,
    },
  });
  if (!doc) {
    return NextResponse.json({ error: "Non trovato" }, { status: 404 });
  }
  if (!canAccessDocumento(session, doc)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.json({
    id: doc.id,
    titoloOriginale: doc.titoloOriginale,
    extractionJson: doc.extractionJson,
    extractionAt: doc.extractionAt,
    dataScadenza: doc.dataScadenza,
    scadenzaConfidence: doc.scadenzaConfidence,
    scadenzaSource: doc.scadenzaSource,
    scadenzaRaw: doc.scadenzaRaw,
    statoValidita: doc.statoValidita,
    nonServeScadenza: doc.nonServeScadenza,
    dipendenteId: doc.dipendenteId,
    automezzoId: doc.automezzoId,
  });
}
