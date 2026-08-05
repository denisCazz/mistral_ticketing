/** Rate limiter in-memory a finestra mobile (processo singolo). */

type Entry = { hits: number[] };

const entries = new Map<string, Entry>();

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 10 * 60 * 1000;
const BLOCK_MS = 15 * 60 * 1000;

const blockedUntil = new Map<string, number>();

export function checkRateLimit(key: string): boolean {
  const now = Date.now();
  if ((blockedUntil.get(key) ?? 0) > now) return false;

  const entry = entries.get(key) ?? { hits: [] };
  entry.hits = entry.hits.filter((t) => now - t < WINDOW_MS);
  return entry.hits.length < MAX_ATTEMPTS;
}

export function recordFailure(key: string): void {
  const now = Date.now();
  const entry = entries.get(key) ?? { hits: [] };
  entry.hits = entry.hits.filter((t) => now - t < WINDOW_MS);
  entry.hits.push(now);
  entries.set(key, entry);
  if (entry.hits.length >= MAX_ATTEMPTS) {
    blockedUntil.set(key, now + BLOCK_MS);
    entries.delete(key);
  }
}

export function resetFailures(key: string): void {
  entries.delete(key);
  blockedUntil.delete(key);
}
