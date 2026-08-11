import { describe, expect, it } from "vitest";
import { calculateRetrievalMetrics } from "@/lib/retrieval-metrics";

describe("retrieval metrics", () => {
  it("calcola recall, reciprocal rank e rank-one rate", () => {
    const metrics = calculateRetrievalMetrics([
      {
        expected: ["a"],
        actual: ["a", "b"],
        latencyMs: 20,
      },
      {
        expected: ["c"],
        actual: ["b", "c"],
        latencyMs: 30,
      },
    ]);

    expect(metrics.recallAt5).toBe(1);
    expect(metrics.mrr).toBe(0.75);
    expect(metrics.rankOneRate).toBe(0.5);
    expect(metrics.averageLatencyMs).toBe(25);
  });
});
