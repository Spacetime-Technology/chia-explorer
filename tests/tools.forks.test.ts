import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';

const { createTestClient, parseToolText } = await import('./helpers/create-test-client.js');
const { resetCache } = await import('../src/github/cache.js');

type FetchArgs = Parameters<typeof fetch>;
type FetchMock = ReturnType<typeof vi.fn<(...args: FetchArgs) => Promise<Response>>>;

const FORKS_FIXTURE = `---
title: Forks
slug: /chia-blockchain/consensus/forks
---

It was last updated on 2026-04-29.

| Activation Block | Activation Date | Type | Build  | Status    | Description                                                                                          |
| :--------------- | :-------------- | :--- | :----- | :-------- | :--------------------------------------------------------------------------------------------------- |
| \`2 300 000\`      | 2022-07-22      | Soft | 1.3.0  | Activated | [Disallow negative division](https://www.chia.net/2022/03/04/divided-we-fork/)                       |
| \`5 496 000\`      | 2024-06-13      | Hard | 2.4.0  | Activated | [CHIP-12 Decrease plot filter](https://github.com/Chia-Network/chips/blob/main/CHIPs/chip-0012.md)   |
| \`9 562 000\`      | 2026-11         | Hard | ?      | Planned   | [CHIP-48 & CHIP-49 New Proof of Space](https://github.com/Chia-Network/chips/pull/160)               |
`;

function textResponse(body: string, status = 200): Response {
  return new Response(body, { status, statusText: status === 200 ? 'OK' : 'Not Found' });
}

function asUrl(input: FetchArgs[0]): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function setupFetch(handlers: Record<string, () => Response>): FetchMock {
  const mock = vi.fn<(...args: FetchArgs) => Promise<Response>>((input) => {
    const url = asUrl(input);
    for (const [pattern, response] of Object.entries(handlers)) {
      if (url.includes(pattern)) return Promise.resolve(response());
    }
    return Promise.resolve(
      new Response(`unhandled ${url}`, { status: 599, statusText: 'Test Unhandled' })
    );
  });
  vi.stubGlobal('fetch', mock);
  return mock;
}

const FORKS_RAW_PATH =
  'raw.githubusercontent.com/Chia-Network/chia-docs/main/docs/chia-blockchain/consensus/forks.md';

describe('list_forks tool (mocked fetch)', () => {
  let client: Client;
  let cleanup: () => Promise<void>;

  beforeAll(async () => {
    ({ client, cleanup } = await createTestClient());
  });

  afterAll(async () => {
    await cleanup();
  });

  beforeEach(() => {
    resetCache();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns last_updated, source_url, and a flat fork list parsed from the markdown', async () => {
    setupFetch({ [FORKS_RAW_PATH]: () => textResponse(FORKS_FIXTURE) });
    const res = await client.callTool({ name: 'list_forks', arguments: {} });
    const body = parseToolText(res) as {
      source_url: string;
      markdown_url: string;
      last_updated: string;
      count: number;
      forks: Array<{
        type: 'hard' | 'soft';
        name: string;
        activation_block: number | null;
        activation_date: string | null;
        build: string | null;
        status: string;
        purpose_url: string | null;
      }>;
    };

    expect(body.source_url).toBe('https://docs.chia.net/chia-blockchain/consensus/forks/');
    expect(body.markdown_url).toContain('Chia-Network/chia-docs');
    expect(body.last_updated).toBe('2026-04-29');
    expect(body.count).toBe(3);

    const soft = body.forks.find((f) => f.name === 'Disallow negative division')!;
    expect(soft.type).toBe('soft');
    expect(soft.activation_block).toBe(2_300_000);
    expect(soft.activation_date).toBe('2022-07-22');
    expect(soft.status).toBe('Activated');
    expect(soft.purpose_url).toBe('https://www.chia.net/2022/03/04/divided-we-fork/');

    const hard = body.forks.find((f) => f.name === 'CHIP-12 Decrease plot filter')!;
    expect(hard.type).toBe('hard');
    expect(hard.activation_block).toBe(5_496_000);

    const planned = body.forks.find((f) => f.status === 'Planned')!;
    expect(planned.type).toBe('hard');
    expect(planned.activation_block).toBe(9_562_000);
  });

  it('surfaces a useful error when the docs file is missing', async () => {
    setupFetch({ [FORKS_RAW_PATH]: () => textResponse('', 404) });
    const res = (await client.callTool({ name: 'list_forks', arguments: {} })) as {
      isError?: boolean;
      content: Array<{ text: string }>;
    };
    expect(res.isError).toBe(true);
    const body = JSON.parse(res.content[0]!.text) as { error: string };
    expect(body.error).toMatch(/not found|404/i);
  });
});
