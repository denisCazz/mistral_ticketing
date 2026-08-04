/** Feature flags e configurazione runtime. */
export const RAPPORTINI_ENABLED =
  process.env.RAPPORTINI_ENABLED !== "false";

export const CRON_SECRET = process.env.CRON_SECRET ?? "";

export const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? "";
export const OPENAI_EMBEDDING_MODEL =
  process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small";
export const OPENAI_CHAT_MODEL =
  process.env.OPENAI_CHAT_MODEL ?? "gpt-4o-mini";

export const DOCUMENTI_SOURCE_PATH =
  process.env.DOCUMENTI_SOURCE_PATH ?? "";

export const APP_URL = (
  process.env.NEXTAUTH_URL ?? "http://localhost:3000"
).replace(/\/$/, "");

export const ALERT_GIORNI_PRIMA = [30, 7, 1] as const;
