import { fetchXchPrices } from './client.js';
import { getCachedPrices, setCachedPrices } from './cache.js';

export async function getXchPrices(currencies: string[]): Promise<Record<string, number>> {
  const { cached, missing } = getCachedPrices(currencies);
  if (missing.length === 0) return cached;
  const fetched = await fetchXchPrices(missing);
  setCachedPrices(fetched);
  return { ...cached, ...fetched };
}

export { resetCache } from './cache.js';
