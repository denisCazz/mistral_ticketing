import { describe, expect, it } from "vitest";
import { documentAiAdminActionSchema } from "@/lib/document-ai-admin";

describe("document AI admin actions", () => {
  it("richiede conferma esplicita per la rielaborazione completa", () => {
    expect(
      documentAiAdminActionSchema.safeParse({
        action: "full_reprocess",
        confirmed: false,
      }).success
    ).toBe(false);
    expect(
      documentAiAdminActionSchema.safeParse({
        action: "full_reprocess",
        confirmed: true,
      }).success
    ).toBe(true);
  });

  it("accetta reindicizzazione embedding-only", () => {
    expect(
      documentAiAdminActionSchema.safeParse({
        action: "reindex_all",
      }).success
    ).toBe(true);
  });
});
