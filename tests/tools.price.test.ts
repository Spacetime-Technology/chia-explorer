import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';

const { createTestClient, parseToolText } = await import('./helpers/create-test-client.js');
const { resetCache } = await import('../src/coingecko/cache.js');

type FetchArgs = Parameters<typeof fetch>;
type FetchMock = ReturnType<typeof vi.fn<(...args: FetchArgs) => Promise<Response>>>;

function jsonResponse(
  body: unknown,
  init: { status?: number; statusText?: string } = {}
): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    statusText: init.statusText ?? 'OK',
    headers: { 'content-type': 'application/json' },
  });
}

function callUrl(mock: FetchMock, index: number): string {
  const arg = mock.mock.calls[index]![0];
  if (typeof arg === 'string') return arg;
  if (arg instanceof URL) return arg.toString();
  return arg.url;
}

describe('price tools (mocked fetch)', () => {
  let client: Client;
  let cleanup: () => Promise<void>;
  let fetchMock: FetchMock;

  beforeAll(async () => {
    ({ client, cleanup } = await createTestClient());
  });

  afterAll(async () => {
    await cleanup();
  });

  beforeEach(() => {
    resetCache();
    fetchMock = vi.fn<(...args: FetchArgs) => Promise<Response>>();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('get_xch_price returns usd price by default', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ chia: { usd: 25.5 } }));
    const res = await client.callTool({ name: 'get_xch_price', arguments: {} });
    const body = parseToolText(res) as {
      source: string;
      asset: string;
      prices: Record<string, number>;
    };
    expect(body.source).toBe('coingecko');
    expect(body.asset).toBe('chia');
    expect(body.prices).toEqual({ usd: 25.5 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = callUrl(fetchMock, 0);
    expect(url).toContain('ids=chia');
    expect(url).toContain('vs_currencies=usd');
  });

  it('get_xch_price requests every supplied currency and lowercases them', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ chia: { usd: 25.5, eur: 23.1, btc: 0.0004 } }));
    const res = await client.callTool({
      name: 'get_xch_price',
      arguments: { currencies: ['USD', 'eur', 'BTC'] },
    });
    const body = parseToolText(res) as { prices: Record<string, number> };
    expect(body.prices).toEqual({ usd: 25.5, eur: 23.1, btc: 0.0004 });
    const url = callUrl(fetchMock, 0);
    expect(url).toContain('vs_currencies=usd%2Ceur%2Cbtc');
  });

  it('caches prices for 60s and serves the second call without refetching', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ chia: { usd: 25.5 } }));
    await client.callTool({ name: 'get_xch_price', arguments: { currencies: ['usd'] } });
    await client.callTool({ name: 'get_xch_price', arguments: { currencies: ['usd'] } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('only refetches currencies that are missing from the cache', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ chia: { usd: 25.5 } }))
      .mockResolvedValueOnce(jsonResponse({ chia: { eur: 23.1 } }));
    await client.callTool({ name: 'get_xch_price', arguments: { currencies: ['usd'] } });
    await client.callTool({
      name: 'get_xch_price',
      arguments: { currencies: ['usd', 'eur'] },
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const secondUrl = callUrl(fetchMock, 1);
    expect(secondUrl).toContain('vs_currencies=eur');
    expect(secondUrl).not.toContain('usd');
  });

  it('sends x-cg-demo-api-key header when COINGECKO_API_KEY is set', async () => {
    vi.stubEnv('COINGECKO_API_KEY', 'secret-key');
    fetchMock.mockResolvedValue(jsonResponse({ chia: { usd: 1 } }));
    await client.callTool({ name: 'get_xch_price', arguments: { currencies: ['usd'] } });
    const init = fetchMock.mock.calls[0]![1];
    const headers = (init?.headers ?? {}) as Record<string, string>;
    expect(headers['x-cg-demo-api-key']).toBe('secret-key');
  });

  it('convert_xch_to_fiat multiplies XCH by price for each currency', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ chia: { usd: 2, eur: 4 } }));
    const res = await client.callTool({
      name: 'convert_xch_to_fiat',
      arguments: { mojo: '1500000000000', currencies: ['usd', 'eur'] },
    });
    const body = parseToolText(res) as {
      mojo: string;
      amount_xch: string;
      values: Record<string, number>;
      prices_per_xch: Record<string, number>;
    };
    expect(body.mojo).toBe('1500000000000');
    expect(body.amount_xch).toBe('1.5');
    expect(body.values).toEqual({ usd: 3, eur: 6 });
    expect(body.prices_per_xch).toEqual({ usd: 2, eur: 4 });
  });

  it('convert_xch_to_fiat handles zero mojo', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ chia: { usd: 25.5 } }));
    const res = await client.callTool({
      name: 'convert_xch_to_fiat',
      arguments: { mojo: '0' },
    });
    const body = parseToolText(res) as { amount_xch: string; values: Record<string, number> };
    expect(body.amount_xch).toBe('0');
    expect(body.values).toEqual({ usd: 0 });
  });

  it('surfaces non-2xx responses via isError', async () => {
    fetchMock.mockResolvedValue(
      new Response('rate limited', { status: 429, statusText: 'Too Many Requests' })
    );
    const res = (await client.callTool({
      name: 'get_xch_price',
      arguments: { currencies: ['usd'] },
    })) as { isError?: boolean; content: Array<{ text: string }> };
    expect(res.isError).toBe(true);
    const body = JSON.parse(res.content[0]!.text) as { error: string };
    expect(body.error).toContain('429');
  });

  it('surfaces a missing `chia` key as an error', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}));
    const res = (await client.callTool({
      name: 'get_xch_price',
      arguments: { currencies: ['usd'] },
    })) as { isError?: boolean; content: Array<{ text: string }> };
    expect(res.isError).toBe(true);
    const body = JSON.parse(res.content[0]!.text) as { error: string };
    expect(body.error).toContain('chia');
  });
});
