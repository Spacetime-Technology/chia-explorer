const TTL_MS = 60_000;

interface Entry {
  price: number;
  expiresAt: number;
}

const cache = new Map<string, Entry>();

export function getCachedPrices(currencies: string[]): {
  cached: Record<string, number>;
  missing: string[];
} {
  const now = Date.now();
  const cached: Record<string, number> = {};
  const missing: string[] = [];
  for (const currency of currencies) {
    const entry = cache.get(currency);
    if (entry && entry.expiresAt > now) {
      cached[currency] = entry.price;
    } else {
      missing.push(currency);
    }
  }
  return { cached, missing };
}

export function setCachedPrices(prices: Record<string, number>): void {
  const expiresAt = Date.now() + TTL_MS;
  for (const [currency, price] of Object.entries(prices)) {
    cache.set(currency, { price, expiresAt });
  }
}

export function resetCache(): void {
  cache.clear();
}
