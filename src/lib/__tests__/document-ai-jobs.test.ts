import { describe, expect, it } from "vitest";
import {
  embeddingOnlyNeedsPipeline,
  nextJobStateAfterFailure,
  shouldRequeueExpiredLease,
} from "@/lib/document-ai-jobs";

describe("document AI jobs", () => {
  it("ritenta con backoff fino al terzo tentativo", () => {
    const now = new Date("2026-08-10T12:00:00Z");
    const retry = nextJobStateAfterFailure({
      attempts: 0,
      maxAttempts: 3,
      terminal: false,
      now,
      error: "rate limit",
    });

    expect(retry.status).toBe("PENDING");
    expect(retry.attempts).toBe(1);
    expect(retry.nextRunAt.getTime()).toBe(now.getTime() + 2000);

    const failed = nextJobStateAfterFailure({
      attempts: 2,
      maxAttempts: 3,
      terminal: false,
      now,
      error: "still failing",
    });
    expect(failed.status).toBe("FAILED");
  });

  it("EMBEDDING_ONLY senza testo deve passare dalla pipeline OCR", () => {
    expect(embeddingOnlyNeedsPipeline(null)).toBe(true);
    expect(embeddingOnlyNeedsPipeline("")).toBe(true);
    expect(embeddingOnlyNeedsPipeline("   ")).toBe(true);
    expect(embeddingOnlyNeedsPipeline("Manuale estintori")).toBe(false);
  });

  it("recupera un lease RUNNING scaduto", () => {
    expect(
      shouldRequeueExpiredLease({
        status: "RUNNING",
        leaseExpiresAt: new Date("2026-08-10T11:59:00Z"),
        now: new Date("2026-08-10T12:00:00Z"),
      })
    ).toBe(true);
  });
});
