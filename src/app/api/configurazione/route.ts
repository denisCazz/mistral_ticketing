import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  getOrCreateAziendaSettings,
  normalizeAlertEmails,
} from "@/lib/alert-recipients";
import {
  estimateCostUsd,
  estimateTokensFromText,
  formatUsd,
} from "@/lib/ai-costs";
import { OPENAI_CHAT_MODEL, OPENAI_EMBEDDING_MODEL } from "@/lib/config";

function startOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function startOfPrevMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth() - 1, 1);
}

function costOfAudit(row: {
  model: string;
  prompt: string;
  outputJson: unknown;
  promptTokens?: number | null;
  completionTokens?: number | null;
  embeddingTokens?: number | null;
}): { promptTokens: number; completionTokens: number; embeddingTokens: number; costUsd: number; estimated: boolean } {
  const usage =
    row.outputJson &&
    typeof row.outputJson === "object" &&
    "_usage" in (row.outputJson as object)
      ? ((row.outputJson as { _usage?: Record<string, number> })._usage ?? null)
      : null;

  const storedPrompt = row.promptTokens ?? usage?.promptTokens ?? null;
  const storedCompletion = row.completionTokens ?? usage?.completionTokens ?? null;
  const storedEmbedding = row.embeddingTokens ?? usage?.embeddingTokens ?? null;

  const hasExactTokens = storedPrompt != null && storedCompletion != null;
  const promptTokens = storedPrompt ?? estimateTokensFromText(row.prompt);
  const completionTokens =
    storedCompletion ??
    estimateTokensFromText(JSON.stringify(row.outputJson ?? {}));
  const embeddingTokens =
    storedEmbedding ?? (hasExactTokens ? 0 : estimateTokensFromText(row.prompt));
  // Ricalcola sempre dalle tariffe correnti (incl. markup).
  const costUsd = estimateCostUsd({
    model: row.model || OPENAI_CHAT_MODEL,
    promptTokens,
    completionTokens,
    embeddingTokens,
    embeddingModel: OPENAI_EMBEDDING_MODEL,
  });
  return {
    promptTokens,
    completionTokens,
    embeddingTokens,
    costUsd,
    estimated: !hasExactTokens,
  };
}

export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const settings = await getOrCreateAziendaSettings();
  const admins = await prisma.user.findMany({
    where: { role: "ADMIN", active: true },
    select: { id: true, name: true, email: true },
    orderBy: { name: "asc" },
  });

  const now = new Date();
  const monthStart = startOfMonth(now);
  const prevMonthStart = startOfPrevMonth(now);

  const audits = await prisma.aiGenerationAudit.findMany({
    where: { createdAt: { gte: prevMonthStart } },
    select: {
      id: true,
      model: true,
      prompt: true,
      outputJson: true,
      createdAt: true,
      user: { select: { name: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  let meseCorrente = {
    generazioni: 0,
    promptTokens: 0,
    completionTokens: 0,
    embeddingTokens: 0,
    costoUsd: 0,
    stimeParziali: 0,
  };
  let mesePrecedente = {
    generazioni: 0,
    promptTokens: 0,
    completionTokens: 0,
    embeddingTokens: 0,
    costoUsd: 0,
    stimeParziali: 0,
  };

  const recenti: Array<{
    id: string;
    createdAt: string;
    model: string;
    user: string;
    promptTokens: number;
    completionTokens: number;
    embeddingTokens: number;
    costoUsd: number;
    estimated: boolean;
  }> = [];

  for (const row of audits) {
    const c = costOfAudit(row);
    const bucket =
      row.createdAt >= monthStart ? meseCorrente : mesePrecedente;
    bucket.generazioni += 1;
    bucket.promptTokens += c.promptTokens;
    bucket.completionTokens += c.completionTokens;
    bucket.embeddingTokens += c.embeddingTokens;
    bucket.costoUsd += c.costUsd;
    if (c.estimated) bucket.stimeParziali += 1;

    if (row.createdAt >= monthStart && recenti.length < 20) {
      recenti.push({
        id: row.id,
        createdAt: row.createdAt.toISOString(),
        model: row.model,
        user: row.user.name || row.user.email,
        promptTokens: c.promptTokens,
        completionTokens: c.completionTokens,
        embeddingTokens: c.embeddingTokens,
        costoUsd: c.costUsd,
        estimated: c.estimated,
      });
    }
  }

  const allTimeCount = await prisma.aiGenerationAudit.count();

  return NextResponse.json({
    alert: {
      emails: settings.alertEmails,
      includiAdmin: settings.alertIncludiAdmin,
      adminAttivi: admins,
    },
    ai: {
      modelloChat: OPENAI_CHAT_MODEL,
      modelloEmbedding: OPENAI_EMBEDDING_MODEL,
      meseCorrente: {
        ...meseCorrente,
        costoUsdFormatted: formatUsd(meseCorrente.costoUsd),
      },
      mesePrecedente: {
        ...mesePrecedente,
        costoUsdFormatted: formatUsd(mesePrecedente.costoUsd),
      },
      totaleGenerazioni: allTimeCount,
      recenti,
    },
  });
}

export async function PUT(req: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const emails = normalizeAlertEmails(body.emails);
  if (emails === null) {
    return NextResponse.json(
      { error: "Elenco email non valido" },
      { status: 400 }
    );
  }

  const includiAdmin = Boolean(body.includiAdmin);
  if (!includiAdmin && emails.length === 0) {
    return NextResponse.json(
      {
        error:
          "Imposta almeno un'email oppure lascia attiva l'opzione admin",
      },
      { status: 400 }
    );
  }

  await getOrCreateAziendaSettings();
  const settings = await prisma.aziendaSettings.update({
    where: { id: "default" },
    data: {
      alertEmails: emails,
      alertIncludiAdmin: includiAdmin,
    },
  });

  return NextResponse.json({
    alert: {
      emails: settings.alertEmails,
      includiAdmin: settings.alertIncludiAdmin,
    },
  });
}
