import OpenAI from "openai";
import {
  OPENAI_API_KEY,
  OPENAI_CHAT_MODEL,
  OPENAI_EMBEDDING_MODEL,
} from "@/lib/config";
import { estimateCostUsd } from "@/lib/ai-costs";

let openai: OpenAI | null = null;

export function isOpenAiConfigured(): boolean {
  return Boolean(OPENAI_API_KEY);
}

function getOpenAi(): OpenAI {
  if (!isOpenAiConfigured()) throw new Error("OPENAI_API_KEY mancante");
  if (!openai) openai = new OpenAI({ apiKey: OPENAI_API_KEY });
  return openai;
}

export interface EmbedResult {
  embeddings: number[][];
  tokens: number;
}

export async function embedTexts(texts: string[]): Promise<EmbedResult> {
  const client = getOpenAi();
  const res = await client.embeddings.create({
    model: OPENAI_EMBEDDING_MODEL,
    input: texts,
  });
  return {
    embeddings: res.data.map((d) => d.embedding),
    tokens: res.usage?.total_tokens ?? 0,
  };
}

export async function embedText(
  text: string
): Promise<{ embedding: number[]; tokens: number }> {
  const { embeddings, tokens } = await embedTexts([text]);
  return { embedding: embeddings[0], tokens };
}

export interface PreventivoAiOutput {
  introduzione: string;
  condizioni: string;
  righe: Array<{
    descrizione: string;
    quantita: number;
    prezzoUnitario: number;
    scontoPercentuale: number;
    aliquotaIva: number;
  }>;
}

export interface PreventivoAiResult {
  output: PreventivoAiOutput;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export async function generatePreventivoDraft(params: {
  prompt: string;
  clienteInfo: string;
  contextChunks: Array<{ content: string; documentoId: string; titolo: string }>;
}): Promise<PreventivoAiResult> {
  const client = getOpenAi();
  const sourcesText = params.contextChunks
    .map(
      (c, i) =>
        `[${i + 1}] ${c.titolo} (doc:${c.documentoId})\n${c.content.slice(0, 1500)}`
    )
    .join("\n\n");

  const system = `Sei un assistente per preventivi tecnici (antincendio/elettrico/impianti) di Mistral Impianti.
Devi SEMPRE produrre una bozza completa e utilizzabile, anche se le fonti documentali mancano o sono scarse.

Rispondi SOLO con JSON valido con questo schema esatto:
{
  "introduzione": "string",
  "condizioni": "string",
  "righe": [{ "descrizione": "string", "quantita": number, "prezzoUnitario": number, "scontoPercentuale": number, "aliquotaIva": number }]
}

Regole:
- introduzione: testo professionale in italiano (almeno 2-3 frasi) che presenta il preventivo in base alla richiesta.
- condizioni: condizioni di fornitura tipiche (validità, tempi, esclusione IVA se rilevante, note operative).
- righe: almeno 1 voce coerente con la richiesta; se non conosci il prezzo metti prezzoUnitario 0 e in descrizione indica "(prezzo da confermare)".
- Preferisci prezzi/voci dalle fonti quando disponibili; non inventare listini precisi.
- aliquotaIva di default 22, scontoPercentuale di default 0.`;

  const user = `Cliente:\n${params.clienteInfo}\n\nRichiesta:\n${params.prompt}\n\nFonti documentali (opzionali):\n${sourcesText || "Nessuna fonte disponibile: genera comunque una bozza realistica dalla richiesta, con prezzi a 0 da confermare."}`;

  const res = await client.chat.completions.create({
    model: OPENAI_CHAT_MODEL,
    temperature: 0.3,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });

  const raw = res.choices[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(raw) as PreventivoAiOutput;
  const output: PreventivoAiOutput = {
    introduzione: parsed.introduzione ?? "",
    condizioni: parsed.condizioni ?? "",
    righe: (parsed.righe ?? []).map((r) => ({
      descrizione: r.descrizione ?? "",
      quantita: Number(r.quantita) || 1,
      prezzoUnitario: Number(r.prezzoUnitario) || 0,
      scontoPercentuale: Number(r.scontoPercentuale) || 0,
      aliquotaIva: Number(r.aliquotaIva) || 22,
    })),
  };

  return {
    output,
    model: OPENAI_CHAT_MODEL,
    promptTokens: res.usage?.prompt_tokens ?? 0,
    completionTokens: res.usage?.completion_tokens ?? 0,
    totalTokens: res.usage?.total_tokens ?? 0,
  };
}

export function buildAiAuditCost(params: {
  model: string;
  promptTokens: number;
  completionTokens: number;
  embeddingTokens: number;
}): number {
  return estimateCostUsd({
    model: params.model,
    promptTokens: params.promptTokens,
    completionTokens: params.completionTokens,
    embeddingTokens: params.embeddingTokens,
    embeddingModel: OPENAI_EMBEDDING_MODEL,
  });
}
