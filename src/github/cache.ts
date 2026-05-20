const DEFAULT_TTL_MS = 5 * 60_000;

interface Entry<T> {
  value: T;
  expiresAt: number;
}

const cache = new Map<string, Entry<unknown>>();

export async function getCached<T>(
  key: string,
  loader: () => Promise<T>,
  ttlMs: number = DEFAULT_TTL_MS
): Promise<T> {
  const now = Date.now();
  const entry = cache.get(key) as Entry<T> | undefined;
  if (entry && entry.expiresAt > now) return entry.value;
  const value = await loader();
  cache.set(key, { value, expiresAt: now + ttlMs });
  return value;
}

export function invalidate(key: string): void {
  cache.delete(key);
}

export function resetCache(): void {
  cache.clear();
}
