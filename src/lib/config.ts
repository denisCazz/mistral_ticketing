/** Feature flags e configurazione runtime. Fail-closed: default OFF. */
export const RAPPORTINI_ENABLED =
  process.env.RAPPORTINI_ENABLED === "true";
export const CRON_SECRET = process.env.CRON_SECRET ?? "";

export const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? "";
export const OPENAI_EMBEDDING_MODEL =
  process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small";
export const OPENAI_EMBEDDING_DIMENSIONS = 1536 as const;
export const DOCUMENT_EMBEDDING_VERSION =
  process.env.DOCUMENT_EMBEDDING_VERSION ?? "document-v2";
export const DOCUMENT_AI_WORKER_POLL_MS = Math.max(
  500,
  Number(process.env.DOCUMENT_AI_WORKER_POLL_MS ?? 2000)
);
export const DOCUMENT_EMBEDDING_RETENTION_DAYS = Math.max(
  1,
  Number(process.env.DOCUMENT_EMBEDDING_RETENTION_DAYS ?? 14)
);
export const DOCUMENT_EMBEDDING_CLEANUP_ENABLED =
  process.env.DOCUMENT_EMBEDDING_CLEANUP_ENABLED === "true";
export const DOCUMENT_SIMILARITY_MIN = Math.min(
  1,
  Math.max(0, Number(process.env.DOCUMENT_SIMILARITY_MIN ?? 0.72))
);
export const OPENAI_CHAT_MODEL =
  process.env.OPENAI_CHAT_MODEL ?? "gpt-4o-mini";
/** Modello vision/OCR (PDF scansionati e immagini). */
export const OPENAI_VISION_MODEL =
  process.env.OPENAI_VISION_MODEL ?? OPENAI_CHAT_MODEL;

/** Soglie confidence estrazione documenti. */
export const EXTRACTION_AUTO_APPLY = 0.9;
export const EXTRACTION_REVIEW_MIN = 0.65;
/** Sotto questa lunghezza testo → fallback OCR multimodale. */
export const OCR_MIN_TEXT_CHARS = 40;

export const DOCUMENTI_SOURCE_PATH =
  process.env.DOCUMENTI_SOURCE_PATH ?? "";

export const APP_URL = (
  process.env.NEXTAUTH_URL ?? "http://localhost:3000"
).replace(/\/$/, "");

export const ALERT_GIORNI_PRIMA = [30, 7, 1] as const;
