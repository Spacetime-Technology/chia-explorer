import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';

const { createTestClient, parseToolText } = await import('./helpers/create-test-client.js');
const { resetCache } = await import('../src/github/cache.js');

type FetchArgs = Parameters<typeof fetch>;
type FetchMock = ReturnType<typeof vi.fn<(...args: FetchArgs) => Promise<Response>>>;

const CHIP_42 = `CHIP Number   | 0042
:-------------|:----
Title         | Protected Single Sided Offers
Description   | Describes a way for wallets to securely make and take single sided offers.
Author        | [Brandon Haggstrom](https://github.com/Rigidity)
Status        | Final
Category      | Informational
Sub-Category  | Guideline
Created       | 2025-02-04

## Abstract

Single sided offers protected via aggregate signatures and intermediate coin spends.

## Motivation
...
`;

const CHIP_57 = `CHIP Number   | 0057
:-------------|:----
Title         | Silent Payments
Description   | Stealth addresses for Chia.
Author        | [Some Author](https://github.com/kdc2000)
Status        | Draft
Category      | Standards Track
Created       | 2026-04-01

## Abstract

A scheme for stealth payments.
`;

const README_FIXTURE = `# CHia Improvement Proposals (CHIPs)

## CHIP list

### Living
* [1 - CHia Improvement Proposal (CHIP) process](/CHIPs/chip-0001.md)

### Draft
* [57 - Silent Payments](https://github.com/Chia-Network/chips/pull/198)

### Final
* [42 - Protected Single Sided Offers](/CHIPs/chip-0042.md)
`;

const README_ONLY_42 = `# CHia Improvement Proposals (CHIPs)

### Final
* [42 - Protected Single Sided Offers](/CHIPs/chip-0042.md)
`;

function textResponse(body: string, status = 200): Response {
  return new Response(body, { status, statusText: status === 200 ? 'OK' : 'Not Found' });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    statusText: 'OK',
    headers: { 'content-type': 'application/json' },
  });
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

describe('chips tools (mocked fetch)', () => {
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
    vi.unstubAllEnvs();
  });

  it('list_chips returns README-driven entries including Final files and Draft PRs', async () => {
    setupFetch({
      'raw.githubusercontent.com/Chia-Network/chips/main/README.md': () =>
        textResponse(README_FIXTURE),
      'api.github.com/repos/Chia-Network/chips/pulls?state=open': () =>
        jsonResponse([
          {
            number: 198,
            title: 'CHIP-0057: Silent Payments',
            html_url: 'https://github.com/Chia-Network/chips/pull/198',
            state: 'open',
            draft: false,
            created_at: '2026-05-01T00:00:00Z',
            updated_at: '2026-05-14T00:00:00Z',
            user: { login: 'kdc2000' },
            requested_reviewers: [{ login: 'danieljperry' }],
            head: { sha: 'abc123', ref: 'silent-payments' },
            base: { ref: 'main' },
          },
        ]),
      'api.github.com/repos/Chia-Network/chips/pulls/198/files': () =>
        jsonResponse([{ filename: 'CHIPs/chip-0057.md', status: 'added' }]),
      'raw.githubusercontent.com/Chia-Network/chips/abc123/CHIPs/chip-0057.md': () =>
        textResponse(CHIP_57),
      'raw.githubusercontent.com/Chia-Network/chips/main/CHIPs/chip-0001.md': () =>
        textResponse(''),
      'raw.githubusercontent.com/Chia-Network/chips/main/CHIPs/chip-0042.md': () =>
        textResponse(CHIP_42),
    });
    const res = await client.callTool({ name: 'list_chips', arguments: {} });
    const body = parseToolText(res) as {
      count: number;
      chips: Array<{
        number: number;
        title: string;
        status: string;
        kind: string;
        abstract: string | null;
        pr: { number: number } | null;
      }>;
    };
    expect(body.count).toBe(3);
    const chip42 = body.chips.find((c) => c.number === 42)!;
    expect(chip42.status).toBe('Final');
    expect(chip42.kind).toBe('file');
    expect(chip42.title).toBe('Protected Single Sided Offers');
    expect(chip42.abstract).toContain('Single sided offers');
    const chip57 = body.chips.find((c) => c.number === 57)!;
    expect(chip57.status).toBe('Draft');
    expect(chip57.kind).toBe('pr');
    expect(chip57.pr?.number).toBe(198);
    expect(chip57.abstract).toContain('stealth payments');
  });

  it('list_chips applies the status filter against the README status', async () => {
    setupFetch({
      'raw.githubusercontent.com/Chia-Network/chips/main/README.md': () =>
        textResponse(README_ONLY_42),
      'api.github.com/repos/Chia-Network/chips/pulls?state=open': () => jsonResponse([]),
      'raw.githubusercontent.com/Chia-Network/chips/main/CHIPs/chip-0042.md': () =>
        textResponse(CHIP_42),
    });
    const res = await client.callTool({
      name: 'list_chips',
      arguments: { status: 'Draft' },
    });
    const body = parseToolText(res) as { count: number };
    expect(body.count).toBe(0);
  });

  it('get_chip returns merged chip with abstract but no body by default', async () => {
    setupFetch({
      'raw.githubusercontent.com/Chia-Network/chips/main/CHIPs/chip-0042.md': () =>
        textResponse(CHIP_42),
      'api.github.com/repos/Chia-Network/chips/pulls?state=open': () => jsonResponse([]),
    });
    const res = await client.callTool({ name: 'get_chip', arguments: { number: 42 } });
    const body = parseToolText(res) as {
      found: boolean;
      merged: { title: string; abstract: string; body?: string };
    };
    expect(body.found).toBe(true);
    expect(body.merged.title).toBe('Protected Single Sided Offers');
    expect(body.merged.abstract).toContain('Single sided offers');
    expect(body.merged.body).toBeUndefined();
  });

  it('get_chip with include_body=true returns full markdown', async () => {
    setupFetch({
      'raw.githubusercontent.com/Chia-Network/chips/main/CHIPs/chip-0042.md': () =>
        textResponse(CHIP_42),
      'api.github.com/repos/Chia-Network/chips/pulls?state=open': () => jsonResponse([]),
    });
    const res = await client.callTool({
      name: 'get_chip',
      arguments: { number: 42, include_body: true },
    });
    const body = parseToolText(res) as { merged: { body?: string } };
    expect(body.merged.body).toBe(CHIP_42);
  });

  it('get_chip returns found:false for an unknown number', async () => {
    setupFetch({
      'raw.githubusercontent.com/Chia-Network/chips/main/CHIPs/chip-0999.md': () =>
        textResponse('', 404),
      'api.github.com/repos/Chia-Network/chips/pulls?state=open': () => jsonResponse([]),
    });
    const res = await client.callTool({ name: 'get_chip', arguments: { number: 999 } });
    const body = parseToolText(res) as { found: boolean };
    expect(body.found).toBe(false);
  });

  it('list_chip_drafts returns parsed CHIP from an open PR', async () => {
    setupFetch({
      'api.github.com/repos/Chia-Network/chips/pulls?state=open': () =>
        jsonResponse([
          {
            number: 198,
            title: 'CHIP-0057: Silent Payments',
            html_url: 'https://github.com/Chia-Network/chips/pull/198',
            state: 'open',
            draft: false,
            created_at: '2026-05-01T00:00:00Z',
            updated_at: '2026-05-14T00:00:00Z',
            user: { login: 'kdc2000' },
            requested_reviewers: [{ login: 'danieljperry' }],
            head: { sha: 'abc123', ref: 'silent-payments' },
            base: { ref: 'main' },
          },
        ]),
      'api.github.com/repos/Chia-Network/chips/pulls/198/files': () =>
        jsonResponse([{ filename: 'CHIPs/chip-0057.md', status: 'added' }]),
      'raw.githubusercontent.com/Chia-Network/chips/abc123/CHIPs/chip-0057.md': () =>
        textResponse(CHIP_57),
    });
    const res = await client.callTool({ name: 'list_chip_drafts', arguments: {} });
    const body = parseToolText(res) as {
      count: number;
      drafts: Array<{
        number: number;
        title: string;
        status: string;
        modifies_existing: boolean;
        pr: { number: number; author: string; requested_reviewers: string[] };
      }>;
    };
    expect(body.count).toBe(1);
    const first = body.drafts[0]!;
    expect(first.number).toBe(57);
    expect(first.title).toBe('Silent Payments');
    expect(first.status).toBe('Draft');
    expect(first.modifies_existing).toBe(false);
    expect(first.pr.number).toBe(198);
    expect(first.pr.author).toBe('kdc2000');
    expect(first.pr.requested_reviewers).toEqual(['danieljperry']);
  });

  it('list_chip_drafts filters out PRs that do not touch a CHIP file', async () => {
    setupFetch({
      'api.github.com/repos/Chia-Network/chips/pulls?state=open': () =>
        jsonResponse([
          {
            number: 300,
            title: 'fix typo in README',
            html_url: 'https://github.com/Chia-Network/chips/pull/300',
            state: 'open',
            draft: false,
            created_at: '2026-05-01T00:00:00Z',
            updated_at: '2026-05-01T00:00:00Z',
            user: { login: 'someone' },
            requested_reviewers: [],
            head: { sha: 'def456', ref: 'typo' },
            base: { ref: 'main' },
          },
        ]),
      'api.github.com/repos/Chia-Network/chips/pulls/300/files': () =>
        jsonResponse([{ filename: 'README.md', status: 'modified' }]),
    });
    const res = await client.callTool({ name: 'list_chip_drafts', arguments: {} });
    const body = parseToolText(res) as { count: number };
    expect(body.count).toBe(0);
  });

  it('search_chips matches across title and abstract', async () => {
    setupFetch({
      'raw.githubusercontent.com/Chia-Network/chips/main/README.md': () =>
        textResponse(README_ONLY_42),
      'raw.githubusercontent.com/Chia-Network/chips/main/CHIPs/chip-0042.md': () =>
        textResponse(CHIP_42),
      'api.github.com/repos/Chia-Network/chips/pulls?state=open': () => jsonResponse([]),
    });
    const res = await client.callTool({
      name: 'search_chips',
      arguments: { query: 'single sided' },
    });
    const body = parseToolText(res) as {
      count: number;
      matches: Array<{ number: number; source: string }>;
    };
    expect(body.count).toBe(1);
    expect(body.matches[0]!.number).toBe(42);
    expect(body.matches[0]!.source).toBe('merged');
  });

  it('search_chips respects source=draft', async () => {
    setupFetch({
      'raw.githubusercontent.com/Chia-Network/chips/main/README.md': () =>
        textResponse(README_FIXTURE),
      'api.github.com/repos/Chia-Network/chips/pulls?state=open': () =>
        jsonResponse([
          {
            number: 198,
            title: 'CHIP-0057: Silent Payments',
            html_url: 'https://github.com/Chia-Network/chips/pull/198',
            state: 'open',
            draft: false,
            created_at: '2026-05-01T00:00:00Z',
            updated_at: '2026-05-14T00:00:00Z',
            user: { login: 'kdc2000' },
            requested_reviewers: [],
            head: { sha: 'abc123', ref: 'silent' },
            base: { ref: 'main' },
          },
        ]),
      'api.github.com/repos/Chia-Network/chips/pulls/198/files': () =>
        jsonResponse([{ filename: 'CHIPs/chip-0057.md', status: 'added' }]),
      'raw.githubusercontent.com/Chia-Network/chips/abc123/CHIPs/chip-0057.md': () =>
        textResponse(CHIP_57),
      'raw.githubusercontent.com/Chia-Network/chips/main/CHIPs/chip-0001.md': () =>
        textResponse(''),
      'raw.githubusercontent.com/Chia-Network/chips/main/CHIPs/chip-0042.md': () =>
        textResponse(CHIP_42),
    });
    const res = await client.callTool({
      name: 'search_chips',
      arguments: { query: 'stealth', source: 'draft' },
    });
    const body = parseToolText(res) as { count: number; matches: Array<{ source: string }> };
    expect(body.count).toBe(1);
    expect(body.matches[0]!.source).toBe('draft');
  });

  it('sends GITHUB_TOKEN as Authorization Bearer when set', async () => {
    vi.stubEnv('GITHUB_TOKEN', 'ghp_test');
    const mock = setupFetch({
      'raw.githubusercontent.com/Chia-Network/chips/main/README.md': () =>
        textResponse(README_ONLY_42),
      'api.github.com/repos/Chia-Network/chips/pulls?state=open': () => jsonResponse([]),
      'raw.githubusercontent.com/Chia-Network/chips/main/CHIPs/chip-0042.md': () =>
        textResponse(CHIP_42),
    });
    await client.callTool({ name: 'list_chips', arguments: {} });
    const apiCall = mock.mock.calls.find((c) => asUrl(c[0]).includes('api.github.com'));
    expect(apiCall).toBeDefined();
    const headers = (apiCall![1]?.headers ?? {}) as Record<string, string>;
    expect(headers['authorization']).toBe('Bearer ghp_test');
  });

  it('surfaces GitHub rate-limit responses with a helpful message', async () => {
    setupFetch({
      'raw.githubusercontent.com/Chia-Network/chips/main/README.md': () =>
        textResponse(README_ONLY_42),
      'api.github.com/repos/Chia-Network/chips/pulls?state=open': () =>
        new Response('API rate limit exceeded', {
          status: 403,
          statusText: 'Forbidden',
          headers: {
            'x-ratelimit-remaining': '0',
            'x-ratelimit-reset': '1900000000',
          },
        }),
    });
    const res = (await client.callTool({ name: 'list_chips', arguments: {} })) as {
      isError?: boolean;
      content: Array<{ text: string }>;
    };
    expect(res.isError).toBe(true);
    const body = JSON.parse(res.content[0]!.text) as { error: string };
    expect(body.error).toMatch(/rate limit/i);
    expect(body.error).toContain('GITHUB_TOKEN');
  });
});
