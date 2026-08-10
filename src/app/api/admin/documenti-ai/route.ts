import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import {
  getDocumentiAiStats,
  listDocumentiAiPending,
  processDocumentoAi,
} from "@/lib/document-ai-batch";

export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const stats = await getDocumentiAiStats();
  return NextResponse.json(stats);
}

const postSchema = z.object({
  limit: z.number().int().min(1).max(25).optional().default(5),
  force: z.boolean().optional().default(false),
  enableOcr: z.boolean().optional().default(true),
  enableStructure: z.boolean().optional().default(true),
  enableRag: z.boolean().optional().default(true),
  documentoIds: z.array(z.string().min(1)).max(25).optional(),
});

/**
 * Batch coda AI: testo/OCR → struttura → embedding RAG.
 * Nuovi upload restano PENDING e vengono presi da qui.
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Parametri non validi", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const {
    limit,
    force,
    enableOcr,
    enableStructure,
    enableRag,
    documentoIds,
  } = parsed.data;

  const targets =
    documentoIds && documentoIds.length > 0
      ? documentoIds.map((id) => ({
          id,
          titoloOriginale: id,
          categoria: "",
        }))
      : await listDocumentiAiPending({ force, limit });

  const results = [];
  for (const doc of targets.slice(0, limit)) {
    const result = await processDocumentoAi(doc.id, {
      force,
      enableOcr,
      enableStructure,
      enableRag,
      userId: session.user.id,
    });
    results.push(result);
  }

  const stats = await getDocumentiAiStats();
  const summary = {
    processed: results.length,
    ok: results.filter((r) => r.status === "OK").length,
    review: results.filter((r) => r.status === "REVIEW").length,
    skip: results.filter((r) => r.status === "SKIP").length,
    fail: results.filter((r) => r.status === "FAIL").length,
    chunksIndexed: results.reduce(
      (sum, r) => sum + (r.chunksIndexed ?? 0),
      0
    ),
  };

  return NextResponse.json({ results, summary, stats });
}
