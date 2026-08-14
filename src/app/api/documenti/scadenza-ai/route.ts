import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canAccessDocumento } from "@/lib/access";
import { prisma } from "@/lib/db";
import { enqueueDocumentAiJob } from "@/lib/document-ai-jobs";

const MAX_IDS = 40;

export async function POST(req: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const rawIds = Array.isArray(body?.ids) ? body.ids : [];
  const unique = new Set<string>();
  for (const id of rawIds) {
    if (typeof id === "string" && id.trim() !== "") unique.add(id.trim());
  }
  const ids = [...unique].slice(0, MAX_IDS);

  if (ids.length === 0) {
    return NextResponse.json(
      { error: "Nessun documento selezionato" },
      { status: 400 }
    );
  }

  const documenti = await prisma.documento.findMany({
    where: { id: { in: ids }, canonicalDocumentoId: null },
    select: {
      id: true,
      entityType: true,
      categoria: true,
      extractionAt: true,
    },
  });

  const allowed = documenti.filter((doc) => canAccessDocumento(session, doc));
  let queued = 0;
  for (const doc of allowed) {
    await enqueueDocumentAiJob({
      documentoId: doc.id,
      type: "FULL_PIPELINE",
    });
    queued += 1;
  }

  return NextResponse.json({
    queued,
    requested: ids.length,
    skipped: ids.length - queued,
  });
}
