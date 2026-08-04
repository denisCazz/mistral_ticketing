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

export interface DocumentAnswerResult {
  answer: string;
  citedSourceIndexes: number[];
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export async function generateDocumentAnswer(params: {
  question: string;
  contextChunks: Array<{
    content: string;
    documentoId: string;
    titolo: string;
    index: number;
  }>;
}): Promise<DocumentAnswerResult> {
  const client = getOpenAi();
  const sourcesText = params.contextChunks
    .map(
      (c) =>
        `[${c.index}] Titolo: ${c.titolo} (doc:${c.documentoId})\n${c.content.slice(0, 2000)}`
    )
    .join("\n\n");

  const system = `Sei l'assistente documentale di Mistral Impianti.
Rispondi SOLO in italiano e SOLO usando le fonti documentali fornite nell'utente.

Regole obbligatorie:
- Se la domanda non riguarda i documenti caricati, oppure le fonti non contengono informazioni sufficienti, rispondi esattamente: "Non ho trovato informazioni sufficienti nei documenti caricati per rispondere a questa domanda."
- Non inventare fatti, prezzi, date, norme o procedure assenti dalle fonti.
- Non rispondere a domande generali, di chiacchiere o fuori ambito aziendale/documentale.
- Ogni fonte numerata corrisponde a un solo documento, anche quando contiene più estratti separati.
- Se la domanda chiede quali documenti trattano un argomento, indica il titolo di ciascun documento pertinente; non descrivere fonti o estratti dello stesso documento come documenti distinti.
- Cita sempre le fonti usate con riferimenti numerici [1], [2], ecc. (gli indici delle fonti fornite).
- Preferisci risposte concise e precise; elenca i punti se utile.
- Restituisci SOLO JSON valido nel formato:
  {"answer":"testo della risposta con citazioni [n]","citedSourceIndexes":[1,2]}
- citedSourceIndexes deve contenere esclusivamente gli indici delle fonti che sostengono davvero la risposta.
- Se non puoi rispondere, citedSourceIndexes deve essere un array vuoto.`;

  const user = params.contextChunks.length
    ? `Domanda:\n${params.question}\n\nFonti documentali:\n${sourcesText}`
    : `Domanda:\n${params.question}\n\nFonti documentali:\nNessuna fonte disponibile.`;

  const res = await client.chat.completions.create({
    model: OPENAI_CHAT_MODEL,
    temperature: 0.1,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });

  const raw = res.choices[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(raw) as {
    answer?: unknown;
    citedSourceIndexes?: unknown;
  };
  const answer =
    typeof parsed.answer === "string" ? parsed.answer.trim() : "";
  const validIndexes = new Set(params.contextChunks.map((c) => c.index));
  const citedSourceIndexes = Array.isArray(parsed.citedSourceIndexes)
    ? [
        ...new Set(
          parsed.citedSourceIndexes
            .map(Number)
            .filter((index) => Number.isInteger(index) && validIndexes.has(index))
        ),
      ]
    : [];

  return {
    answer,
    citedSourceIndexes,
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
