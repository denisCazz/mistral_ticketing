import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  isOpenAiConfigured,
  embedText,
  generatePreventivoDraft,
  buildAiAuditCost,
} from "@/lib/openai";
import { searchSimilarChunks } from "@/lib/rag";
import { OPENAI_CHAT_MODEL } from "@/lib/config";
import { canAccessDocumentiHr, documentiHrWhere } from "@/lib/access";

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!isOpenAiConfigured()) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY non configurata" },
      { status: 503 }
    );
  }

  const body = await req.json();
  const prompt = String(body.prompt ?? "").trim();
  if (!prompt) {
    return NextResponse.json({ error: "prompt obbligatorio" }, { status: 400 });
  }

  const clienteId = body.clienteId ? String(body.clienteId) : null;
  let clienteInfo = "";
  if (clienteId) {
    const cliente = await prisma.cliente.findUnique({ where: { id: clienteId } });
    if (!cliente) {
      return NextResponse.json({ error: "Cliente non trovato" }, { status: 404 });
    }
    clienteInfo = [
      cliente.ragioneSociale,
      cliente.indirizzo,
      cliente.citta,
      cliente.email,
      cliente.cellulare,
    ]
      .filter(Boolean)
      .join("\n");
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

  const chunks = await searchSimilarChunks(
    queryEmbedding,
    6,
    prompt,
    documentiHrWhere(canAccessDocumentiHr(session))
  );

  let draft;
  try {
    draft = await generatePreventivoDraft({
      prompt,
      clienteInfo: clienteInfo || "Cliente non ancora specificato",
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

  // Solo campi base: i token/costi vanno in outputJson per evitare mismatch client Prisma.
  void prisma.aiGenerationAudit
    .create({
      data: {
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
