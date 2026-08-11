function assertVector(vector: number[], label: string): void {
  if (vector.length === 0) {
    throw new Error(`${label}: vettore vuoto`);
  }
  if (vector.some((value) => !Number.isFinite(value))) {
    throw new Error(`${label}: valore non finito`);
  }
}

export function cosineSimilarity(a: number[], b: number[]): number {
  assertVector(a, "a");
  assertVector(b, "b");
  if (a.length !== b.length) {
    throw new Error("dimensioni vettoriali incompatibili");
  }

  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let index = 0; index < a.length; index += 1) {
    dot += a[index] * b[index];
    normA += a[index] ** 2;
    normB += b[index] ** 2;
  }

  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function normalizeVector(vector: number[]): number[] {
  assertVector(vector, "vector");
  const norm = Math.hypot(...vector);
  if (norm === 0) {
    throw new Error("impossibile normalizzare un vettore nullo");
  }
  return vector.map((value) => value / norm);
}

export function normalizedWeightedCentroid(
  items: Array<{ vector: number[]; weight: number }>
): number[] {
  if (items.length === 0) {
    throw new Error("centroide senza vettori");
  }

  const dimensions = items[0].vector.length;
  const sum = Array<number>(dimensions).fill(0);
  let totalWeight = 0;

  for (const item of items) {
    assertVector(item.vector, "centroid vector");
    if (item.vector.length !== dimensions) {
      throw new Error("dimensioni vettoriali incompatibili nel centroide");
    }
    if (!Number.isFinite(item.weight) || item.weight <= 0) {
      throw new Error("peso del centroide non valido");
    }
    totalWeight += item.weight;
    for (let index = 0; index < dimensions; index += 1) {
      sum[index] += item.vector[index] * item.weight;
    }
  }

  return normalizeVector(sum.map((value) => value / totalWeight));
}

export function reciprocalRankFusion(
  vectorRanking: string[],
  lexicalRanking: string[],
  k = 60
): Array<{ id: string; score: number }> {
  if (!Number.isFinite(k) || k <= 0) {
    throw new Error("costante RRF non valida");
  }

  const scores = new Map<string, number>();
  for (const ranking of [vectorRanking, lexicalRanking]) {
    ranking.forEach((id, index) => {
      scores.set(id, (scores.get(id) ?? 0) + 1 / (k + index + 1));
    });
  }

  return [...scores.entries()]
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}
