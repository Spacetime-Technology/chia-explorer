const COINGECKO_URL = 'https://api.coingecko.com/api/v3/simple/price';
const REQUEST_TIMEOUT_MS = 10_000;

export async function fetchXchPrices(currencies: string[]): Promise<Record<string, number>> {
  if (currencies.length === 0) {
    throw new Error('at least one currency is required');
  }

  const params = new URLSearchParams({
    ids: 'chia',
    vs_currencies: currencies.join(','),
  });

  const headers: Record<string, string> = { accept: 'application/json' };
  const apiKey = process.env.COINGECKO_API_KEY;
  if (apiKey) headers['x-cg-demo-api-key'] = apiKey;

  const res = await fetch(`${COINGECKO_URL}?${params.toString()}`, {
    headers,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const detail = body ? `: ${body.slice(0, 200)}` : '';
    throw new Error(`coingecko ${res.status} ${res.statusText}${detail}`);
  }

  const data = (await res.json()) as unknown;
  if (!data || typeof data !== 'object' || !('chia' in data)) {
    throw new Error('coingecko response missing `chia` field');
  }
  const chia = data.chia;
  if (!chia || typeof chia !== 'object') {
    throw new Error('coingecko response `chia` field is not an object');
  }

  const out: Record<string, number> = {};
  for (const [currency, value] of Object.entries(chia)) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new Error(`coingecko returned non-numeric price for ${currency}`);
    }
    out[currency.toLowerCase()] = value;
  }

  const missing = currencies.filter((c) => !(c in out));
  if (missing.length > 0) {
    throw new Error(`coingecko returned no price for: ${missing.join(', ')}`);
  }

  return out;
}
