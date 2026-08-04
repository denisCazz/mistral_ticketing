import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  isOpenAiConfigured,
  embedText,
  generateDocumentAnswer,
  buildAiAuditCost,
} from "@/lib/openai";
import { searchSimilarChunks } from "@/lib/rag";
import { OPENAI_CHAT_MODEL } from "@/lib/config";
import { groupChunksByDocument } from "@/lib/document-answer-sources";

const MIN_SIMILARITY = 0.35;
const MAX_QUESTION_LENGTH = 2000;
const NO_ANSWER =
  "Non ho trovato informazioni sufficienti nei documenti caricati per rispondere a questa domanda.";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isOpenAiConfigured()) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY non configurata" },
      { status: 503 }
    );
  }

  const body = await req.json();
  const question = String(body.question ?? "").trim();
  if (!question) {
    return NextResponse.json({ error: "Domanda obbligatoria" }, { status: 400 });
  }
  if (question.length > MAX_QUESTION_LENGTH) {
    return NextResponse.json(
      { error: `Domanda troppo lunga (max ${MAX_QUESTION_LENGTH} caratteri)` },
      { status: 400 }
    );
  }

  let queryEmbedding: number[];
  let embeddingTokens = 0;
  try {
    const embedded = await embedText(question);
    queryEmbedding = embedded.embedding;
    embeddingTokens = embedded.tokens;
  } catch (err) {
    console.error("embedText failed (documenti chat):", err);
    return NextResponse.json(
      { error: "Errore embedding OpenAI. Riprova tra poco." },
      { status: 502 }
    );
  }

  const ranked = await searchSimilarChunks(queryEmbedding, 16, question);
  const dynamicCutoff = ranked.length
    ? Math.max(MIN_SIMILARITY, ranked[0].relevance - 0.1)
    : MIN_SIMILARITY;
  const chunksPerDocument = new Map<string, number>();
  const chunks = ranked
    .filter((c) => c.relevance >= dynamicCutoff)
    .filter((c) => {
      const count = chunksPerDocument.get(c.documentoId) ?? 0;
      if (count >= 2) return false;
      chunksPerDocument.set(c.documentoId, count + 1);
      return true;
    })
    .slice(0, 8);
  const documentSources = groupChunksByDocument(chunks, question);

  let answerResult;
  try {
    answerResult = await generateDocumentAnswer({
      question,
      contextChunks: documentSources.map((source) => ({
        content: source.content,
        documentoId: source.documentoId,
        titolo: source.titolo,
        index: source.index,
      })),
    });
  } catch (err) {
    console.error("generateDocumentAnswer failed:", err);
    return NextResponse.json(
      { error: "Errore generazione AI. Riprova tra poco." },
      { status: 502 }
    );
  }

  const model = answerResult.model || OPENAI_CHAT_MODEL;
  const estimatedCostUsd = buildAiAuditCost({
    model,
    promptTokens: answerResult.promptTokens,
    completionTokens: answerResult.completionTokens,
    embeddingTokens,
  });

  const answer = answerResult.answer || NO_ANSWER;
  const isNoAnswer = answer.startsWith(NO_ANSWER);
  const citedIndexes = new Set(
    isNoAnswer ? [] : answerResult.citedSourceIndexes
  );
  const fonti = documentSources
    .filter(({ index }) => citedIndexes.has(index))
    .map((source) => ({
      index: source.index,
      documentoId: source.documentoId,
      titolo: source.titolo,
      excerpt: source.excerpt,
      similarity: source.similarity,
    }));

  void prisma.aiGenerationAudit
    .create({
      data: {
        userId: session.user.id,
        prompt: question,
        model,
        sources: fonti,
        outputJson: {
          type: "documenti_chat",
          answer,
          _usage: {
            promptTokens: answerResult.promptTokens,
            completionTokens: answerResult.completionTokens,
            embeddingTokens,
            totalTokens: answerResult.totalTokens + embeddingTokens,
            estimatedCostUsd,
          },
        },
      },
    })
    .catch((err) => {
      console.error("AiGenerationAudit create failed (documenti chat):", err);
    });

  return NextResponse.json({
    answer,
    fonti,
  });
}
