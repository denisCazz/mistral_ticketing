/** Cache client-side per albero e liste documenti (sessionStorage + memoria). */

const TTL_MS = 5 * 60 * 1000;

type Box<T> = { at: number; data: T };

let memoryTree: Box<unknown> | null = null;
const memoryLists = new Map<string, Box<unknown>>();

function readSession<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const box = JSON.parse(raw) as Box<T>;
    if (Date.now() - box.at > TTL_MS) return null;
    return box.data;
  } catch {
    return null;
  }
}

function writeSession<T>(key: string, data: T) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(key, JSON.stringify({ at: Date.now(), data } satisfies Box<T>));
  } catch {
    /* quota / private mode */
  }
}

export function getCachedTree<T>(): T | null {
  if (memoryTree && Date.now() - memoryTree.at <= TTL_MS) {
    return memoryTree.data as T;
  }
  const fromSession = readSession<T>("mistral:documenti:albero:v1");
  if (fromSession) {
    memoryTree = { at: Date.now(), data: fromSession };
  }
  return fromSession;
}

export function setCachedTree<T>(data: T) {
  memoryTree = { at: Date.now(), data };
  writeSession("mistral:documenti:albero:v1", data);
}

export function getCachedList<T>(queryKey: string): T | null {
  const mem = memoryLists.get(queryKey);
  if (mem && Date.now() - mem.at <= TTL_MS) return mem.data as T;
  const fromSession = readSession<T>(`mistral:documenti:list:v1:${queryKey}`);
  if (fromSession) {
    memoryLists.set(queryKey, { at: Date.now(), data: fromSession });
  }
  return fromSession;
}

export function setCachedList<T>(queryKey: string, data: T) {
  memoryLists.set(queryKey, { at: Date.now(), data });
  writeSession(`mistral:documenti:list:v1:${queryKey}`, data);
}

export function invalidateDocumentiCache() {
  memoryTree = null;
  memoryLists.clear();
  if (typeof window === "undefined") return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key?.startsWith("mistral:documenti:")) keys.push(key);
    }
    for (const key of keys) sessionStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}
