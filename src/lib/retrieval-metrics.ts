export type RetrievalEvaluationCase = {
  expected: string[];
  actual: string[];
  latencyMs: number;
};

export type RetrievalMetrics = {
  recallAt5: number;
  mrr: number;
  rankOneRate: number;
  averageLatencyMs: number;
  averageDiversity: number;
};

export function calculateRetrievalMetrics(
  cases: RetrievalEvaluationCase[]
): RetrievalMetrics {
  if (cases.length === 0) {
    return {
      recallAt5: 0,
      mrr: 0,
      rankOneRate: 0,
      averageLatencyMs: 0,
      averageDiversity: 0,
    };
  }

  let recall = 0;
  let reciprocalRank = 0;
  let rankOne = 0;
  let latency = 0;
  let diversity = 0;

  for (const item of cases) {
    const expected = new Set(item.expected);
    const topFive = item.actual.slice(0, 5);
    const matched = topFive.filter((id) => expected.has(id)).length;
    recall += expected.size > 0 ? matched / expected.size : 0;

    const firstRelevant = item.actual.findIndex((id) => expected.has(id));
    if (firstRelevant >= 0) reciprocalRank += 1 / (firstRelevant + 1);
    if (firstRelevant === 0) rankOne += 1;

    latency += Math.max(0, item.latencyMs);
    diversity +=
      topFive.length > 0 ? new Set(topFive).size / topFive.length : 0;
  }

  return {
    recallAt5: recall / cases.length,
    mrr: reciprocalRank / cases.length,
    rankOneRate: rankOne / cases.length,
    averageLatencyMs: latency / cases.length,
    averageDiversity: diversity / cases.length,
  };
}
