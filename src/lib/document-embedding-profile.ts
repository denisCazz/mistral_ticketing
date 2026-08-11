import {
  DOCUMENT_EMBEDDING_VERSION,
  OPENAI_EMBEDDING_DIMENSIONS,
  OPENAI_EMBEDDING_MODEL,
} from "@/lib/config";

export type DocumentEmbeddingProfile = {
  version: string;
  model: string;
  dimensions: 1536;
  targetTokens: number;
  maxTokens: number;
  overlapTokens: number;
  normalizationVersion: string;
};

export const DOCUMENT_EMBEDDING_PROFILE: DocumentEmbeddingProfile = {
  version: DOCUMENT_EMBEDDING_VERSION,
  model: OPENAI_EMBEDDING_MODEL,
  dimensions: OPENAI_EMBEDDING_DIMENSIONS,
  targetTokens: 1000,
  maxTokens: 1200,
  overlapTokens: 120,
  normalizationVersion: "document-text-v2",
};

export function isEmbeddingStale(document: {
  aiWhitelist: boolean;
  embeddingActiveProfile: string | null;
}): boolean {
  return (
    document.aiWhitelist &&
    document.embeddingActiveProfile !== DOCUMENT_EMBEDDING_PROFILE.version
  );
}
