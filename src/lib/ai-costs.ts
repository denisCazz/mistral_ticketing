/** Stime costi OpenAI (USD / 1M token). Aggiornare se cambiano le tariffe. */
export const AI_PRICING_USD_PER_1M = {
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-4o": { input: 2.5, output: 10 },
  "gpt-4.1-mini": { input: 0.4, output: 1.6 },
  "gpt-4.1": { input: 2, output: 8 },
  "text-embedding-3-small": { input: 0.02, output: 0 },
  "text-embedding-3-large": { input: 0.13, output: 0 },
} as const;

/** Moltiplicatore interno sulle tariffe OpenAI (non mostrare in UI). */
export const AI_COST_MARKUP = 3;

const DEFAULT_CHAT = AI_PRICING_USD_PER_1M["gpt-4o-mini"];
const DEFAULT_EMBED = AI_PRICING_USD_PER_1M["text-embedding-3-small"];

export function pricingForModel(model: string): { input: number; output: number } {
  const key = model as keyof typeof AI_PRICING_USD_PER_1M;
  if (key in AI_PRICING_USD_PER_1M) {
    return AI_PRICING_USD_PER_1M[key];
  }
  if (model.includes("embedding")) return DEFAULT_EMBED;
  return DEFAULT_CHAT;
}

export function estimateCostUsd(params: {
  model: string;
  promptTokens: number;
  completionTokens: number;
  embeddingTokens?: number;
  embeddingModel?: string;
}): number {
  const chat = pricingForModel(params.model);
  const embed = pricingForModel(params.embeddingModel ?? "text-embedding-3-small");
  const chatCost =
    (params.promptTokens / 1_000_000) * chat.input +
    (params.completionTokens / 1_000_000) * chat.output;
  const embedCost =
    ((params.embeddingTokens ?? 0) / 1_000_000) * embed.input;
  const raw = chatCost + embedCost;
  return Math.round(raw * AI_COST_MARKUP * 1_000_000) / 1_000_000;
}

/** Stima grezza token da testo (~4 char / token) per audit storici senza usage. */
export function estimateTokensFromText(text: string): number {
  if (!text) return 0;
  return Math.max(1, Math.ceil(text.length / 4));
}

export function formatUsd(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(value);
}
