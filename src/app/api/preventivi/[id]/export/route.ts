import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canAccessPreventivo } from "@/lib/access";
import { prisma } from "@/lib/db";
import { calcolaRiga } from "@/lib/preventivo-calcoli";
import { generatePreventivoPdf } from "@/lib/pdf-preventivo";
import { generatePreventivoDocx } from "@/lib/docx-preventivo";
import { buildStorageKey, isR2Configured, uploadToR2 } from "@/lib/r2";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const formato = (body.formato as string)?.toUpperCase() === "DOCX" ? "DOCX" : "PDF";

  const preventivo = await prisma.preventivo.findUnique({
    where: { id },
    include: {
      cliente: true,
      righe: { orderBy: { ordine: "asc" } },
    },
  });

  if (!preventivo) {
    return NextResponse.json({ error: "Non trovato" }, { status: 404 });
  }
  if (!canAccessPreventivo(session, preventivo)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const azienda = await prisma.aziendaSettings.findUnique({
    where: { id: "default" },
  });

  const righeDettaglio = preventivo.righe.map((r) => {
    const calc = calcolaRiga({
      descrizione: r.descrizione,
      quantita: Number(r.quantita),
      prezzoUnitario: Number(r.prezzoUnitario),
      scontoPercentuale: Number(r.scontoPercentuale),
      aliquotaIva: Number(r.aliquotaIva),
    });
    return {
      descrizione: r.descrizione,
      quantita: Number(r.quantita),
      prezzoUnitario: Number(r.prezzoUnitario),
      scontoPercentuale: Number(r.scontoPercentuale),
      aliquotaIva: Number(r.aliquotaIva),
      imponibile: calc.imponibile,
      totale: calc.totale,
    };
  });

  const validoFino = preventivo.validoFino
    ? preventivo.validoFino.toLocaleDateString("it-IT")
    : null;

  let buffer: Buffer;
  let mimeType: string;
  let ext: string;

  if (formato === "DOCX") {
    buffer = await generatePreventivoDocx({
      numeroPreventivo: preventivo.numeroPreventivo,
      cliente: preventivo.cliente.ragioneSociale,
      introduzione: preventivo.introduzione,
      condizioni: preventivo.condizioni,
      validoFino,
      righe: righeDettaglio,
      totaleFinale: Number(preventivo.totaleFinale ?? 0),
    });
    mimeType =
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    ext = "docx";
  } else {
    buffer = generatePreventivoPdf({
      azienda: {
        nomeAzienda: azienda?.nomeAzienda ?? "Mistral Impianti",
        indirizzo: azienda?.indirizzo,
        partitaIva: azienda?.partitaIva,
        telefono: azienda?.telefono,
        email: azienda?.email,
      },
      preventivo: {
        numeroPreventivo: preventivo.numeroPreventivo,
        introduzione: preventivo.introduzione,
        condizioni: preventivo.condizioni,
        validoFino,
        totaleImponibile: Number(preventivo.totaleImponibile ?? 0),
        totaleIva: Number(preventivo.totaleIva ?? 0),
        totaleFinale: Number(preventivo.totaleFinale ?? 0),
      },
      cliente: preventivo.cliente,
      righe: righeDettaglio,
    });
    mimeType = "application/pdf";
    ext = "pdf";
  }

  const versione = await prisma.preventivoVersione.findFirst({
    where: { preventivoId: id, numeroVersione: preventivo.versione },
    select: { id: true },
  });

  let storageKey: string | null = null;
  if (isR2Configured()) {
    storageKey = buildStorageKey("preventivi", id, ext);
    await uploadToR2(storageKey, buffer, mimeType);
  }

  const exportRecord = await prisma.preventivoExport.create({
    data: {
      preventivoId: id,
      versioneId: versione?.id,
      formato,
      storageKey: storageKey ?? `local/${preventivo.numeroPreventivo}.${ext}`,
      mimeType,
      sizeBytes: buffer.length,
      createdById: session.user!.id!,
    },
  });

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": mimeType,
      "Content-Disposition": `attachment; filename="${preventivo.numeroPreventivo}.${ext}"`,
      "X-Export-Id": exportRecord.id,
    },
  });
}
