import OpenAI from "openai";
import {
  OPENAI_API_KEY,
  OPENAI_CHAT_MODEL,
  OPENAI_EMBEDDING_DIMENSIONS,
  OPENAI_EMBEDDING_MODEL,
  OPENAI_VISION_MODEL,
} from "@/lib/config";
import { estimateCostUsd } from "@/lib/ai-costs";
import {
  DOCUMENT_EXTRACTION_JSON_SCHEMA,
  documentExtractionSchema,
  type DocumentExtraction,
} from "@/lib/document-extraction-schema";

function normalizeOcrText(text: string): string | null {
  const normalized = text
    .replace(/\u0000/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return normalized.length >= 20 ? normalized : null;
}

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

export async function embedTexts(
  texts: string[],
  options: { model?: string; dimensions?: number } = {}
): Promise<EmbedResult> {
  const client = getOpenAi();
  const res = await client.embeddings.create({
    model: options.model ?? OPENAI_EMBEDDING_MODEL,
    input: texts,
    dimensions: options.dimensions ?? OPENAI_EMBEDDING_DIMENSIONS,
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

export interface OcrResult {
  text: string | null;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

function dataUrl(mimeType: string, buf: Buffer): string {
  return `data:${mimeType};base64,${buf.toString("base64")}`;
}

/** OCR multimodale: immagini via vision chat; PDF scansionati via Responses API. */
export async function ocrDocumentBuffer(params: {
  buffer: Buffer;
  mimeType: string;
  filename?: string;
}): Promise<OcrResult> {
  const client = getOpenAi();
  const mime = params.mimeType || "application/octet-stream";
  const isImage = mime.startsWith("image/");
  const isPdf = mime === "application/pdf" || mime.endsWith("/pdf");

  if (!isImage && !isPdf) {
    return {
      text: null,
      model: OPENAI_VISION_MODEL,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    };
  }

  const instruction =
    "Estrai TUTTO il testo leggibile dal documento (OCR). " +
    "Mantieni l'ordine naturale, preserva date, nomi, targhe e numeri. " +
    "Non riassumere. Rispondi solo con il testo estratto.";

  if (isImage) {
    const res = await client.chat.completions.create({
      model: OPENAI_VISION_MODEL,
      temperature: 0,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: instruction },
            {
              type: "image_url",
              image_url: {
                url: dataUrl(mime, params.buffer),
                detail: "high",
              },
            },
          ],
        },
      ],
    });
    const raw = res.choices[0]?.message?.content ?? "";
    return {
      text: normalizeOcrText(raw),
      model: OPENAI_VISION_MODEL,
      promptTokens: res.usage?.prompt_tokens ?? 0,
      completionTokens: res.usage?.completion_tokens ?? 0,
      totalTokens: res.usage?.total_tokens ?? 0,
    };
  }

  // PDF: Responses API con input_file (gestisce anche scan)
  const filename = params.filename?.replace(/[^\w.\-]+/g, "_") || "documento.pdf";
  // Tipizzazione SDK Responses ancora in evoluzione: cast mirato sul payload file.
  const res = await (
    client as unknown as {
      responses: {
        create: (body: Record<string, unknown>) => Promise<{
          output_text?: string;
          output?: unknown;
          usage?: { input_tokens?: number; output_tokens?: number };
        }>;
      };
    }
  ).responses.create({
    model: OPENAI_VISION_MODEL,
    temperature: 0,
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_file",
            filename,
            file_data: dataUrl("application/pdf", params.buffer),
          },
          { type: "input_text", text: instruction },
        ],
      },
    ],
  });

  const raw =
    (res as { output_text?: string }).output_text ??
    extractResponsesText(res);
  return {
    text: normalizeOcrText(raw),
    model: OPENAI_VISION_MODEL,
    promptTokens: res.usage?.input_tokens ?? 0,
    completionTokens: res.usage?.output_tokens ?? 0,
    totalTokens:
      (res.usage?.input_tokens ?? 0) + (res.usage?.output_tokens ?? 0),
  };
}

function extractResponsesText(res: unknown): string {
  if (!res || typeof res !== "object") return "";
  const output = (res as { output?: unknown }).output;
  if (!Array.isArray(output)) return "";
  const parts: string[] = [];
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (
        block &&
        typeof block === "object" &&
        (block as { type?: string }).type === "output_text" &&
        typeof (block as { text?: string }).text === "string"
      ) {
        parts.push((block as { text: string }).text);
      }
    }
  }
  return parts.join("\n");
}

export interface StructuredExtractionAiResult {
  output: DocumentExtraction;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/** Estrazione campi strutturati con JSON Schema strict + validazione Zod. */
export async function extractDocumentFields(params: {
  titolo: string;
  categoria: string;
  sottocategoria?: string | null;
  entityType: string;
  text: string;
}): Promise<StructuredExtractionAiResult> {
  const client = getOpenAi();
  const clipped = params.text.slice(0, 24_000);

  const system = `Sei un estrattore documentale per Mistral Impianti (antincendio/elettrico/HR/flotte).
Estrai SOLO fatti presenti nel testo. Non inventare.
Ogni campo non nullo DEVE avere una evidence con quote testuale copiata dal documento.
Date in formato YYYY-MM-DD.
Se non c'è scadenza e il documento non ne richiede una (es. foto, consegna DPI senza scadenza), nonServeScadenza=true.
confidence: 0-1 stima affidabilità complessiva.
Rispondi solo con JSON conforme allo schema.`;

  const user = `Metadati:
- titolo: ${params.titolo}
- categoria: ${params.categoria}
- sottocategoria: ${params.sottocategoria ?? ""}
- entityType: ${params.entityType}

Testo documento:
${clipped || "(vuoto)"}`;

  const res = await client.chat.completions.create({
    model: OPENAI_CHAT_MODEL,
    temperature: 0,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "document_extraction",
        strict: true,
        schema: DOCUMENT_EXTRACTION_JSON_SCHEMA,
      },
    },
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });

  const raw = res.choices[0]?.message?.content ?? "{}";
  let parsedJson: unknown = {};
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    parsedJson = {};
  }
  const validated = documentExtractionSchema.safeParse(parsedJson);
  const output: DocumentExtraction = validated.success
    ? validated.data
    : {
        documentType: "sconosciuto",
        personaNome: null,
        personaCognome: null,
        targa: null,
        enteEmettitore: null,
        numeroDocumento: null,
        tipoCorso: null,
        dataDocumento: null,
        dataRilascio: null,
        dataScadenza: null,
        nonServeScadenza: false,
        confidence: 0,
        notes: "Risposta modello non valida rispetto allo schema",
        evidence: [],
      };

  return {
    output,
    model: OPENAI_CHAT_MODEL,
    promptTokens: res.usage?.prompt_tokens ?? 0,
    completionTokens: res.usage?.completion_tokens ?? 0,
    totalTokens: res.usage?.total_tokens ?? 0,
  };
}
