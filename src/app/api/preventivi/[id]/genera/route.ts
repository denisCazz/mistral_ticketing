import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canAccessPreventivo } from "@/lib/access";
import { prisma } from "@/lib/db";
import {
  isOpenAiConfigured,
  embedText,
  generatePreventivoDraft,
  buildAiAuditCost,
} from "@/lib/openai";
import { searchSimilarChunks } from "@/lib/rag";
import { OPENAI_CHAT_MODEL } from "@/lib/config";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!isOpenAiConfigured()) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY non configurata" },
      { status: 503 }
    );
  }

  const { id } = await params;
  const body = await req.json();
  const prompt = String(body.prompt ?? "").trim();
  if (!prompt) {
    return NextResponse.json({ error: "prompt obbligatorio" }, { status: 400 });
  }

  const preventivo = await prisma.preventivo.findUnique({
    where: { id },
    include: { cliente: true },
  });

  if (!preventivo) {
    return NextResponse.json({ error: "Non trovato" }, { status: 404 });
  }
  if (!canAccessPreventivo(session, preventivo)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let queryEmbedding: number[];
  let embeddingTokens = 0;
  try {
    const embedded = await embedText(prompt);
    queryEmbedding = embedded.embedding;
    embeddingTokens = embedded.tokens;
  } catch (err) {
    console.error("embedText failed:", err);
    return NextResponse.json(
      { error: "Errore embedding OpenAI. Riprova tra poco." },
      { status: 502 }
    );
  }

  const chunks = await searchSimilarChunks(queryEmbedding, 6);

  const clienteInfo = [
    preventivo.cliente.ragioneSociale,
    preventivo.cliente.indirizzo,
    preventivo.cliente.citta,
    preventivo.cliente.email,
    preventivo.cliente.cellulare,
  ]
    .filter(Boolean)
    .join("\n");

  let draft;
  try {
    draft = await generatePreventivoDraft({
      prompt,
      clienteInfo,
      contextChunks: chunks.map((c) => ({
        content: c.content,
        documentoId: c.documentoId,
        titolo: c.titolo,
      })),
    });
  } catch (err) {
    console.error("generatePreventivoDraft failed:", err);
    return NextResponse.json(
      { error: "Errore generazione AI. Riprova tra poco." },
      { status: 502 }
    );
  }

  const model = draft.model || OPENAI_CHAT_MODEL;
  const estimatedCostUsd = buildAiAuditCost({
    model,
    promptTokens: draft.promptTokens,
    completionTokens: draft.completionTokens,
    embeddingTokens,
  });
  const sources = chunks.map((c) => ({
    documentoId: c.documentoId,
    titolo: c.titolo,
    similarity: c.similarity,
  }));

  void prisma.aiGenerationAudit
    .create({
      data: {
        preventivoId: id,
        userId: session.user!.id!,
        prompt,
        model,
        sources,
        outputJson: {
          ...draft.output,
          _usage: {
            promptTokens: draft.promptTokens,
            completionTokens: draft.completionTokens,
            embeddingTokens,
            totalTokens: draft.totalTokens + embeddingTokens,
            estimatedCostUsd,
          },
        },
      },
    })
    .catch((err) => {
      console.error("AiGenerationAudit create failed (bozza già restituita):", err);
    });

  return NextResponse.json({
    bozza: draft.output,
    fonti: chunks.map((c) => ({
      documentoId: c.documentoId,
      titolo: c.titolo,
      excerpt: c.content.slice(0, 300),
      similarity: c.similarity,
    })),
  });
}
