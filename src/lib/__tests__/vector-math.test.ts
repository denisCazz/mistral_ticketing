import { describe, expect, it } from "vitest";
import {
  cosineSimilarity,
  normalizedWeightedCentroid,
  reciprocalRankFusion,
} from "@/lib/vector-math";

describe("vector math", () => {
  it("normalizza un centroide pesato", () => {
    const centroid = normalizedWeightedCentroid([
      { vector: [1, 0], weight: 2 },
      { vector: [0, 1], weight: 1 },
    ]);

    expect(Math.hypot(...centroid)).toBeCloseTo(1, 8);
    expect(centroid[0]).toBeGreaterThan(centroid[1]);
  });

  it("fonde ranking vettoriale e lessicale", () => {
    const fused = reciprocalRankFusion(
      ["a", "b", "c"],
      ["b", "c", "d"],
      60
    );

    expect(fused[0].id).toBe("b");
    expect(cosineSimilarity([1, 0], [1, 0])).toBe(1);
  });

  it("rifiuta dimensioni incompatibili", () => {
    expect(() => cosineSimilarity([1], [1, 2])).toThrow("dimension");
  });
});
