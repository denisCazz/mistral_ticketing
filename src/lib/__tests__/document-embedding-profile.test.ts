import { describe, expect, it } from "vitest";
import {
  DOCUMENT_EMBEDDING_PROFILE,
  isEmbeddingStale,
} from "@/lib/document-embedding-profile";

describe("document embedding profile", () => {
  it("blocca v2 a 1536 dimensioni", () => {
    expect(DOCUMENT_EMBEDDING_PROFILE).toMatchObject({
      version: "document-v2",
      dimensions: 1536,
      targetTokens: 1000,
      maxTokens: 1200,
      overlapTokens: 120,
    });
  });

  it("considera obsoleto un profilo attivo mancante o diverso", () => {
    expect(
      isEmbeddingStale({
        aiWhitelist: true,
        embeddingActiveProfile: null,
      })
    ).toBe(true);
    expect(
      isEmbeddingStale({
        aiWhitelist: true,
        embeddingActiveProfile: "document-v1",
      })
    ).toBe(true);
    expect(
      isEmbeddingStale({
        aiWhitelist: true,
        embeddingActiveProfile: "document-v2",
      })
    ).toBe(false);
    expect(
      isEmbeddingStale({
        aiWhitelist: false,
        embeddingActiveProfile: null,
      })
    ).toBe(false);
  });
});
